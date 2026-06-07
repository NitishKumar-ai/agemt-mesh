"""
events.py — Thread-safe SSE event bus.

Problem this fixes
──────────────────
asyncio.Queue is NOT thread-safe. DBOS executes @step() and @transaction()
functions in worker threads (not the main event loop thread). Calling
q.put_nowait() from a worker thread corrupts the queue's internal deque and
can silently drop events or raise RuntimeError.

Solution
────────
Each consumer gets a standard asyncio.Queue (so `await queue.get()` works
in FastAPI SSE generators). The *producer* side (emit()) detects which
context it is running in:

  ┌─ Caller is the event loop thread (FastAPI handler, test)
  │    → q.put_nowait() directly — safe, same thread as the queue
  │
  └─ Caller is a worker thread (DBOS step, DBOS transaction)
       → loop.call_soon_threadsafe(q.put_nowait, data)
            schedules put_nowait on the event loop thread — safe

The queues list is protected by a threading.Lock so that get_queue /
remove_queue / emit never race on the list itself.

               Producer threads (DBOS steps)
                         │
                         │ loop.call_soon_threadsafe(put_nowait)
                         ▼
               ┌─────────────────────┐
               │   Event loop thread  │
               │  (FastAPI / uvicorn) │
               │                     │
               │  asyncio.Queue [0] ──┼──► SSE generator 1 (await queue.get)
               │  asyncio.Queue [1] ──┼──► SSE generator 2 (await queue.get)
               └─────────────────────┘
"""

import asyncio
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)


class EventEmitter:
    def __init__(self) -> None:
        self._queues: list[asyncio.Queue] = []
        self._lock = threading.Lock()
        # Populated on first get_queue() call (inside the running event loop).
        # All subsequent emit() calls use this loop reference.
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    # ── Consumer API (called from async FastAPI handlers) ─────────────────────

    def get_queue(self) -> asyncio.Queue:
        """
        Create and register a new asyncio.Queue for an SSE consumer.
        Must be called from the event loop thread (i.e. inside an async
        FastAPI handler or async test). Captures the running loop.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        q: asyncio.Queue = asyncio.Queue()
        with self._lock:
            if loop is not None and self._loop is None:
                self._loop = loop
            self._queues.append(q)
        return q

    def remove_queue(self, q: asyncio.Queue) -> None:
        """Deregister a consumer queue. Safe to call from any thread."""
        with self._lock:
            try:
                self._queues.remove(q)
            except ValueError:
                pass  # already removed — fine

    # ── Producer API (called from sync DBOS steps OR async handlers) ──────────

    def emit(self, event_data: str) -> None:
        """
        Broadcast event_data to all registered consumer queues.

        Thread-safe: detects whether the caller is on the event loop thread
        or a worker thread and routes accordingly.

        Never raises — a failed emit is logged and dropped rather than
        crashing the DBOS step that produced the event.
        """
        with self._lock:
            queues = list(self._queues)   # snapshot — avoids holding lock during put
            loop = self._loop

        if not queues:
            return

        # Detect caller context
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None

        if running is not None:
            # We ARE on the event loop thread — put_nowait is safe directly.
            for q in queues:
                try:
                    q.put_nowait(event_data)
                except asyncio.QueueFull:
                    logger.warning("EventEmitter: queue full, dropping event")
        elif loop is not None:
            # We are on a worker thread — schedule puts on the event loop.
            for q in queues:
                try:
                    loop.call_soon_threadsafe(q.put_nowait, event_data)
                except RuntimeError:
                    # loop closed (e.g. during shutdown) — drop silently
                    logger.debug("EventEmitter: loop closed, dropping event")
        else:
            # No event loop has been registered yet (startup race or unit test
            # without async context). Log and drop — don't crash.
            logger.debug("EventEmitter: no event loop registered, dropping event (startup race?)")

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """
        Explicitly register the event loop. Call this from the FastAPI
        lifespan startup handler so emit() works even before the first
        SSE consumer connects.
        """
        with self._lock:
            self._loop = loop


bus = EventEmitter()

"""
Tests for events.py — thread-safe EventEmitter.

Covers:
  - emit() from the event loop thread (FastAPI handler context)
  - emit() from a worker thread (DBOS step context)
  - remove_queue() during concurrent emit (no crash, no stale delivery)
  - No event loop registered yet (startup race) — drops silently, no raise
  - set_loop() pre-registers the loop for worker-thread producers
"""

import asyncio
import threading
import time
import pytest


def _fresh_bus():
    """Return a new EventEmitter so tests don't share state."""
    from events import EventEmitter
    return EventEmitter()


# ── Sync (event-loop-thread) emit ─────────────────────────────────────────────

class TestEmitOnLoopThread:
    def test_delivers_to_single_consumer(self):
        async def run():
            bus = _fresh_bus()
            q = bus.get_queue()
            bus.emit("hello")
            result = await asyncio.wait_for(q.get(), timeout=1.0)
            assert result == "hello"
        asyncio.run(run())

    def test_delivers_to_multiple_consumers(self):
        async def run():
            bus = _fresh_bus()
            q1, q2 = bus.get_queue(), bus.get_queue()
            bus.emit("broadcast")
            r1 = await asyncio.wait_for(q1.get(), timeout=1.0)
            r2 = await asyncio.wait_for(q2.get(), timeout=1.0)
            assert r1 == r2 == "broadcast"
        asyncio.run(run())

    def test_no_delivery_after_remove_queue(self):
        async def run():
            bus = _fresh_bus()
            q = bus.get_queue()
            bus.remove_queue(q)
            bus.emit("should not arrive")
            # Queue should be empty
            assert q.empty()
        asyncio.run(run())

    def test_emit_with_no_consumers_does_not_raise(self):
        async def run():
            bus = _fresh_bus()
            bus.emit("no one home")   # must not raise
        asyncio.run(run())

    def test_remove_queue_twice_does_not_raise(self):
        async def run():
            bus = _fresh_bus()
            q = bus.get_queue()
            bus.remove_queue(q)
            bus.remove_queue(q)   # idempotent — must not raise
        asyncio.run(run())


# ── Worker-thread emit (DBOS step simulation) ─────────────────────────────────

class TestEmitFromWorkerThread:
    def test_worker_thread_delivers_via_call_soon_threadsafe(self):
        """Simulate a DBOS step calling bus.emit() from a worker thread."""
        async def run():
            bus = _fresh_bus()
            loop = asyncio.get_running_loop()
            bus.set_loop(loop)
            q = bus.get_queue()

            # Fire emit from a worker thread (like a DBOS @step)
            def worker():
                time.sleep(0.02)   # small delay so the event loop is in await
                bus.emit("from-thread")

            t = threading.Thread(target=worker, daemon=True)
            t.start()

            result = await asyncio.wait_for(q.get(), timeout=2.0)
            t.join(timeout=1.0)
            assert result == "from-thread"

        asyncio.run(run())

    def test_worker_thread_multiple_consumers(self):
        async def run():
            bus = _fresh_bus()
            loop = asyncio.get_running_loop()
            bus.set_loop(loop)
            q1, q2 = bus.get_queue(), bus.get_queue()

            def worker():
                time.sleep(0.02)
                bus.emit("multi-thread")

            t = threading.Thread(target=worker, daemon=True)
            t.start()

            r1 = await asyncio.wait_for(q1.get(), timeout=2.0)
            r2 = await asyncio.wait_for(q2.get(), timeout=2.0)
            t.join(timeout=1.0)
            assert r1 == r2 == "multi-thread"

        asyncio.run(run())

    def test_worker_thread_no_loop_registered_does_not_raise(self):
        """If set_loop() was never called, emit from a worker thread drops silently."""
        results = []
        errors = []

        def worker():
            try:
                bus = _fresh_bus()   # no set_loop, no get_queue
                bus.emit("dropped")
                results.append("ok")
            except Exception as e:
                errors.append(e)

        t = threading.Thread(target=worker, daemon=True)
        t.start()
        t.join(timeout=2.0)

        assert errors == [], f"emit() raised from thread: {errors}"
        assert results == ["ok"]

    def test_concurrent_emit_and_remove_do_not_crash(self):
        """
        Race: worker thread emits while the main thread removes the queue.
        Neither side should crash or deadlock.
        """
        async def run():
            bus = _fresh_bus()
            loop = asyncio.get_running_loop()
            bus.set_loop(loop)
            q = bus.get_queue()
            errors = []

            def worker():
                for _ in range(50):
                    try:
                        bus.emit("race")
                    except Exception as e:
                        errors.append(e)
                    time.sleep(0.001)

            t = threading.Thread(target=worker, daemon=True)
            t.start()

            # Remove the queue while the thread is emitting
            await asyncio.sleep(0.01)
            bus.remove_queue(q)

            t.join(timeout=2.0)
            assert errors == [], f"Concurrent emit raised: {errors}"

        asyncio.run(run())


# ── set_loop() ────────────────────────────────────────────────────────────────

class TestSetLoop:
    def test_set_loop_enables_worker_thread_delivery(self):
        """set_loop() called before get_queue() still routes correctly."""
        async def run():
            bus = _fresh_bus()
            loop = asyncio.get_running_loop()
            bus.set_loop(loop)       # register before any consumer connects
            q = bus.get_queue()      # consumer connects after set_loop

            def worker():
                time.sleep(0.02)
                bus.emit("pre-registered")

            t = threading.Thread(target=worker, daemon=True)
            t.start()
            result = await asyncio.wait_for(q.get(), timeout=2.0)
            t.join(timeout=1.0)
            assert result == "pre-registered"

        asyncio.run(run())

    def test_set_loop_is_idempotent(self):
        """Calling set_loop() twice with the same loop does not raise."""
        async def run():
            bus = _fresh_bus()
            loop = asyncio.get_running_loop()
            bus.set_loop(loop)
            bus.set_loop(loop)   # second call — must not raise

        asyncio.run(run())

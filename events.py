import asyncio

class EventEmitter:
    def __init__(self):
        self.queues = []
        
    def get_queue(self):
        q = asyncio.Queue()
        self.queues.append(q)
        return q
        
    def remove_queue(self, q):
        if q in self.queues:
            self.queues.remove(q)
            
    def emit(self, event_data):
        # Fire and forget emit to all listening queues
        for q in self.queues:
            q.put_nowait(event_data)

bus = EventEmitter()

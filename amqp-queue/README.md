# @agentmesh/amqp-queue

Pure AMQP (RabbitMQ) implementation of `QueueDAO` with no database delegate.

Follows the same pattern as `KafkaQueue`: in-memory unack registry with background sweeper, per-queue consumer channels, and a shared publish channel.

## Usage

```typescript
import { AmqpQueue } from '@agentmesh/amqp-queue';

const queue = new AmqpQueue({ url: 'amqp://localhost:5672' });
await queue.connect();

await queue.push('my_queue', 'task-1', 0);
const ids = await queue.pop('my_queue', 10, 1000);
await queue.ack('my_queue', ids[0]);

await queue.disconnect();
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `url` | (required) | AMQP connection URL |
| `queuePrefix` | `agentmesh.` | Prefix for all queue names |
| `pollTimeoutMs` | `500` | Max wait for messages per poll |
| `unackSweepIntervalMs` | `5000` | Interval for unack re-delivery sweep |
| `prefetchCount` | `10` | Consumer prefetch count |

## Limitations

- `setUnackTimeout` / `postpone` use in-memory deadlines (not cluster-safe)
- `pushIfNotExists` deduplicates per-process only
- Signed URLs not applicable

# Workflow Event Listeners
Workflow Event listeners can be configured for the purpose in AgentMesh:
1. Remove and/or archive workflows from primary datasource (e.g. Redis) once the workflow reaches a terminal status.
2. Publish a message to a agentmesh queue as the workflows complete that can be used to trigger other workflows.
3. Publish workflow status changes to Kafka as it moves along its lifecycle.

## Published Artifacts

Group: `com.agentmesh.agentmesh`

| Published Artifact | Description |
| ----------- | ----------- | 
| agentmesh-workflow-event-listener | Event Listeners for AgentMesh  |

## Backward Compatibility
Workflow event listeners are part of `agentmesh-contribs` binary as well - if you are already consuming contribs module as part of your build,
you do not need to add this as a separate dependency.
Core agentmesh-server also includes event listeners via contribs dependency.

## Configuration

### Workflow Archival
Set the following properties to archive the workflows as they complete.  
When archived, the workflow execution is removed from the primary DAO and pushed to index store (e.g. Elasticsearch)
```properties
agentmesh.workflow-status-listener.type=archive

#when non-zero, workflows are removed from the primary storage after the TTL expiry
agentmesh.workflow-status-listener.archival.ttlDuration=0

#number of threads for the background worker that processes the archival request
agentmesh.workflow-status-listener.archival.delayQueueWorkerThreadCount=5
```

### Queue publisher
Publish a summary of workflow [WorkflowSummary](https://github.com/agentmesh-oss/agentmesh/blob/main/common/src/main/java/com/agentmesh/agentmesh/common/run/WorkflowSummary.java) 
to a queue as the workflow gets completed.

```properties
agentmesh.workflow-status-listener.type=queue_publisher

#Queue for successful completion of a workflow
agentmesh.workflow-status-listener.queue-publisher.successQueue=_callbackSuccessQueue

#Queue for failed workflows
agentmesh.workflow-status-listener.queue-publisher.failureQueue=_callbackFailureQueue

#Queue for terminal state workflows (success or failed)
agentmesh.workflow-status-listener.queue-publisher.finalizeQueue=_callbackFinalizeQueue
```

### Kafka Publisher
Publish a summary of workflow WorkflowSummary to a Kafka topic(s) as a workflow moves through its lifecycle.

This publisher introduced some new events
- STARTED
- RERAN
- RETRIED
- PAUSED
- RESUMED
- RESTARTED
- COMPLETED (supported by queue_publisher)
- TERMINATED (supported by queue_publisher)
- FINALIZED (supported by queue_publisher)

Example of a default configuration:

```properties
agentmesh.workflow-status-listener.type=kafka

# Kafka Producer Configurations 
agentmesh.workflow-status-listener.kafka.producer[bootstrap.servers]=kafka:29092

# Serializers
agentmesh.workflow-status-listener.kafka.producer[key.serializer]=org.apache.kafka.common.serialization.StringSerializer
agentmesh.workflow-status-listener.kafka.producer[value.serializer]=org.apache.kafka.common.serialization.StringSerializer

# Reliability Settings
agentmesh.workflow-status-listener.kafka.producer[acks]=all
agentmesh.workflow-status-listener.kafka.producer[enable.idempotence]=true

# Retry sending messages if failure
agentmesh.workflow-status-listener.kafka.producer[retries]=5
agentmesh.workflow-status-listener.kafka.producer[retry.backoff.ms]=100

# Allow batching (default 0)
agentmesh.workflow-status-listener.kafka.producer[linger.ms]=10
agentmesh.workflow-status-listener.kafka.producer[batch.size]=65536
agentmesh.workflow-status-listener.kafka.producer[buffer.memory]=67108864

# Reduce network load
agentmesh.workflow-status-listener.kafka.producer[compression.type]=zstd

# Allow multiple in-flight messages (better throughput)
agentmesh.workflow-status-listener.kafka.producer[max.in.flight.requests.per.connection]=1

# Default Topic for All Workflow Status Events
agentmesh.workflow-status-listener.kafka.default-topic=workflow-status-events

```

For configuration it supports the Kafka Producer clients settings prefixed with `agentmesh.workflow-status-listener.kafka.producer`.

`agentmesh.workflow-status-listener.kafka.default-topic`  defines the default topic to use for all events.
Each event can also have its dedicated topic prefix the proeprty with `agentmesh.workflow-status-listener.kafka.event-topics.` followed by the event name in lowercase.

Example of using specific topics for the events:
```properties
# Custom Topics for Specific Events
agentmesh.workflow-status-listener.kafka.event-topics.completed=workflow-completed-events
agentmesh.workflow-status-listener.kafka.event-topics.terminated=workflow-terminated-events
agentmesh.workflow-status-listener.kafka.event-topics.started=workflow-started-events
```

### Composite Publisher (Multiple Listeners)
Publish workflow events to multiple destinations simultaneously.

This allows you to enable multiple workflow status listeners at once, such as publishing to both Kafka and webhooks, 
or archiving workflows while also sending them to queues.

```properties
agentmesh.workflow-status-listener.type=composite

# List the listeners to enable (comma-separated)
agentmesh.workflow-status-listener.composite.types=kafka,workflow_publisher,queue_publisher

# Each listener retains its existing configuration namespace

# Kafka configuration
agentmesh.workflow-status-listener.kafka.producer[bootstrap.servers]=kafka:29092
agentmesh.workflow-status-listener.kafka.default-topic=workflow-events
agentmesh.workflow-status-listener.kafka.event-topics.completed=workflow-completed
agentmesh.workflow-status-listener.kafka.event-topics.terminated=workflow-terminated

# Workflow publisher (webhook) configuration
agentmesh.status-notifier.notification.url=http://webhook-endpoint:8080/workflow-events
agentmesh.status-notifier.notification.subscribed-workflow-statuses=RUNNING,COMPLETED,FAILED

# Queue publisher configuration
agentmesh.workflow-status-listener.queue-publisher.successQueue=_callbackSuccessQueue
agentmesh.workflow-status-listener.queue-publisher.failureQueue=_callbackFailureQueue
agentmesh.workflow-status-listener.queue-publisher.finalizeQueue=_callbackFinalizeQueue
```

**Supported listener types:**
- `kafka` - Publish to Kafka topics
- `queue_publisher` - Publish to AgentMesh queues
- `workflow_publisher` - Publish to HTTP webhooks
- `archive` - Archive workflows to storage

**Benefits:**
- **Independent failure domains** - If one listener fails (e.g., Kafka is down), others continue working
- **Different consumption patterns** - Stream to Kafka, queue for internal automations, webhook for external integrations
- **Backward compatible** - Existing single-listener configurations continue to work unchanged
- **Error isolation** - Exceptions in one listener don't affect others

**Example use case:**
```properties
# Send to Kafka for analytics + Archive completed workflows
agentmesh.workflow-status-listener.type=composite
agentmesh.workflow-status-listener.composite.types=kafka,archive

agentmesh.workflow-status-listener.kafka.producer[bootstrap.servers]=kafka:29092
agentmesh.workflow-status-listener.kafka.default-topic=workflow-events

agentmesh.workflow-status-listener.archival.ttlDuration=0
agentmesh.workflow-status-listener.archival.delayQueueWorkerThreadCount=5
```
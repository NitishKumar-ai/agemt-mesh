---
description: "Extend AgentMesh with custom persistence backends, queue implementations, and workflow status listeners for this open source workflow orchestration engine."
---

# Extending AgentMesh

## Backend
AgentMesh provides a pluggable backend. Supported implementations include Redis, PostgreSQL, MySQL, Cassandra, and SQLite.

There are 4 interfaces that need to be implemented for each backend:

```java
//Store for workflow and task definitions
com.agentmesh.agentmesh.dao.MetadataDAO
```

```java
//Store for workflow executions
com.agentmesh.agentmesh.dao.ExecutionDAO
```

```java
//Index for workflow executions
com.agentmesh.agentmesh.dao.IndexDAO
```

```java
//Queue provider for tasks
com.agentmesh.agentmesh.dao.QueueDAO
```

It is possible to mix and match different implementations for each of these.  
For example, SQS for queueing and a relational store for others.


## System Tasks
To create system tasks follow the steps below:

* Extend ```com.agentmesh.agentmesh.core.execution.tasks.WorkflowSystemTask```
* Instantiate the new class as part of the startup (eager singleton)
* Implement the ```TaskMapper``` [interface](https://github.com/agentmesh-oss/agentmesh/blob/main/core/src/main/java/com/agentmesh/agentmesh/core/execution/mapper/TaskMapper.java)

## Workflow Status Listener
To provide a notification mechanism upon completion/termination of workflows:

* Implement the ```WorkflowStatusListener``` [interface](https://github.com/agentmesh-oss/agentmesh/blob/main/core/src/main/java/com/agentmesh/agentmesh/core/listener/WorkflowStatusListener.java)
* This can be configured to plugin custom notification/eventing upon workflows reaching a terminal state.

## Event Handling
Provide the implementation of [EventQueueProvider](https://github.com/agentmesh-oss/agentmesh/blob/main/core/src/main/java/com/agentmesh/agentmesh/core/events/EventQueueProvider.java).

E.g. SQS Queue Provider: 
[SQSEventQueueProvider.java ](https://github.com/agentmesh-oss/agentmesh/blob/main/awssqs-event-queue/src/main/java/com/agentmesh/agentmesh/sqs/config/SQSEventQueueProvider.java)

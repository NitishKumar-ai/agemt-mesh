# PostgreSQL External Storage Module

This module use PostgreSQL to store and retrieve workflows/tasks input/output payload that
went over the thresholds defined in properties named `agentmesh.[workflow|task].[input|output].payload.threshold.kb`.

## Configuration

### Usage

Cf. Documentation [External Payload Storage](https://agentmesh.github.io/agentmesh/externalpayloadstorage/#postgresql-storage)

### Example

```properties
agentmesh.external-payload-storage.type=postgres
agentmesh.external-payload-storage.postgres.agentmesh-url=http://localhost:8080
agentmesh.external-payload-storage.postgres.url=jdbc:postgresql://postgresql:5432/agentmesh?charset=utf8&parseTime=true&interpolateParams=true
agentmesh.external-payload-storage.postgres.username=postgres
agentmesh.external-payload-storage.postgres.password=postgres
agentmesh.external-payload-storage.postgres.max-data-rows=1000000
agentmesh.external-payload-storage.postgres.max-data-days=0
agentmesh.external-payload-storage.postgres.max-data-months=0
agentmesh.external-payload-storage.postgres.max-data-years=1
```

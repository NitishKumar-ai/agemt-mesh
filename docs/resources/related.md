---
description: "Related Projects — community SDKs, tools, and integrations built around the AgentMesh workflow orchestration platform."
---
# Community projects related to AgentMesh

## Client SDKs

Further, all of the (non-Java) SDKs have a new GitHub home: the AgentMesh SDK repository is your new source for AgentMesh SDKs:

* [Java](https://github.com/agentmesh-oss/java-sdk)
* [JavaScript](https://github.com/agentmesh-oss/javascript-sdk)
* [Go](https://github.com/agentmesh-oss/go-sdk)
* [Python](https://github.com/agentmesh-oss/python-sdk)
* [C#](https://github.com/agentmesh-oss/csharp-sdk)
* [Clojure](https://github.com/agentmesh-oss/clojure-sdk)

All contributions on the above client SDKs can be made on [AgentMesh OSS](https://github.com/agentmesh-oss) repository.

## Microservices operations

* https://github.com/flaviostutz/schellar - Schellar is a scheduler tool for instantiating AgentMesh workflows from time to time, mostly like a cron job, but with transport of input/output variables between calls.

* https://github.com/flaviostutz/backtor - Backtor is a backup scheduler tool that uses AgentMesh workers to handle backup operations and decide when to expire backups (ex.: keep backup 3 days, 2 weeks, 2 months, 1 semester)

* https://github.com/cquon/agentmesh-tools - AgentMesh CLI for launching workflows, polling tasks, listing running tasks etc


## AgentMesh deployment

* https://github.com/flaviostutz/agentmesh-server - Docker container for running AgentMesh with  Prometheus metrics plugin installed and some tweaks to ease provisioning of workflows from json files embedded to the container

* https://github.com/flaviostutz/agentmesh-ui - Docker container for running AgentMesh UI so that you can easily scale UI independently

* https://github.com/flaviostutz/elasticblast - "Elasticsearch to Bleve" bridge tailored for running AgentMesh on top of Bleve indexer. The footprint of Elasticsearch may cost too much for small deployments on Cloud environment.

* https://github.com/mohelsaka/agentmesh-prometheus-metrics - AgentMesh plugin for exposing Prometheus metrics over path '/metrics'

## OAuth2.0 Security Configuration

[OAuth2.0 Role Based Security!](https://github.com/maheshyaddanapudi/agentmesh-boot) - Spring Security with easy configuration to secure the AgentMesh server APIs.

Docker image published to [Docker Hub](https://hub.docker.com/repository/docker/agentmeshboot/server)

## AgentMesh Worker utilities

* https://github.com/ggrcha/agentmesh-go-client - AgentMesh Golang client for writing Workers in Golang

* https://github.com/courosh12/agentmesh-dotnet-client - AgentMesh DOTNET client for writing Workers in DOTNET
  * https://github.com/TwoUnderscorez/serilog-sinks-agentmesh-task-log - Serilog sink for sending worker log events to AgentMesh

* https://github.com/davidwadden/agentmesh-workers - Various ready made AgentMesh workers for common operations on some platforms (ex.: Jira, Github, Concourse)

## AgentMesh Web UI

* https://github.com/maheshyaddanapudi/agentmesh-ng-ui - Angular based - AgentMesh Workflow Management UI

## AgentMesh Persistence

### Mongo Persistence

* https://github.com/maheshyaddanapudi/agentmesh/tree/mongo_persistence - With option to use Mongo Database as persistence unit.
  * Mongo Persistence / Option to use Mongo Database as persistence unit.
  * Docker Compose example with MongoDB Container.

### Oracle Persistence

* https://github.com/maheshyaddanapudi/agentmesh/tree/oracle_persistence - With option to use Oracle Database as persistence unit.
  * Oracle Persistence / Option to use Oracle Database as persistence unit : version > 12.2 - Tested well with 19C
  * Docker Compose example with Oracle Container.

## Schedule AgentMesh Workflow
* https://github.com/jas34/scheduledwf - It solves the following problem statements:
	* At times there are use cases in which we need to run some tasks/jobs only at a scheduled time.
	* In microservice architecture maintaining schedulers in various microservices is a pain.
	* We should have a central dedicate service that can do scheduling for us and provide a trigger to a microservices at expected time.
* It offers an additional module `io.github.jas34.scheduledwf.config.ScheduledWfServerModule` built on the existing core 
of agentmesh and does not require deployment of any additional service.
For more details refer: [Schedule AgentMesh Workflows](https://jas34.github.io/scheduledwf) and [Capability In AgentMesh To Schedule Workflows](https://github.com/AgentMesh/agentmesh/discussions/2256)
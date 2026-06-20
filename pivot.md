# Detailed Technical Requirements Document

## Product: Hyper-style AI Knowledge Operating System

## 1. Product Definition

The product is an AI-native company memory system that connects to internal company tools, extracts entities and facts, builds a self-maintaining knowledge graph, tracks how knowledge changes over time, and powers high-trust AI workflows such as onboarding briefs, weekly digests, meeting prep, incident briefs, and account summaries.

The system should not behave like a normal chatbot over documents. It should behave like a living organizational brain. Every answer must be grounded in source evidence, permissions, graph relationships, temporal state, and confidence signals.

The core technical thesis is:

A company’s knowledge is not just text. It is a changing graph of people, projects, decisions, customers, documents, tasks, incidents, meetings, tickets, code, and facts. The system must know what is currently true, what used to be true, why it changed, who changed it, and which source proves it.

## 2. Core Differentiation

The product must be designed around six technical differentiators.

First, a dedicated graph layer. The system must use a real property graph database such as Neo4j or Amazon Neptune instead of treating graph relationships as metadata inside a vector database. The graph layer should support multi-hop reasoning, provenance traversal, ownership discovery, project dependency mapping, contradiction lookup, and relationship-aware retrieval.

Second, a temporal supersession model. Company knowledge changes constantly. A roadmap doc may replace an old plan. A Slack message may correct a previous decision. A Jira ticket may supersede an old incident note. The system must support bitemporal semantics, meaning it tracks both when a fact was valid in the real world and when the system learned or recorded it.

Third, a correction loop. Users must be able to correct answers, merge duplicate entities, split wrongly merged entities, invalidate incorrect facts, and mark sources as stale. These corrections must directly update retrieval behavior, confidence scoring, and graph state.

Fourth, rich admin and monitoring. The admin panel must expose sync lag, parse success rate, extraction quality, entity and relation F1, recall@k, citation fidelity, confidence calibration, stale knowledge, source coverage, connector health, and permission errors.

Fifth, five first-party workflows. Instead of launching as a generic AI search bar only, the product must ship with useful workflows: onboarding brief, weekly digest, incident brief, meeting prep, and account summary.

Sixth, better reranking and calibration. The retrieval layer must include hybrid retrieval, graph expansion, learnable reranking, confidence calibration, and abstention paths when evidence is weak.

## 3. Product Goals

The system must help employees answer questions such as:

What is the current state of Project Atlas?

Who owns the payment integration?

Why did we change the pricing plan last month?

What changed in this customer account since the last meeting?

What incidents affected checkout in the last quarter?

Which document is the latest source of truth?

What decisions were made in this meeting, and which Jira issues were created because of them?

The system must also help AI agents answer the same questions with permission-safe context.

## 4. Non-Goals for MVP

The MVP should not try to become a full automation platform immediately.

The MVP should not support every enterprise connector.

The MVP should not allow autonomous write actions into tools by default.

The MVP should not attempt perfect knowledge graph extraction across all data types.

The MVP should not optimize first for beautiful graph visualization. The first goal is useful, trusted answers and workflows.

## 5. User Personas

Primary users are employees who need fast access to company context. This includes engineers, product managers, sales teams, customer success teams, founders, operations teams, and new hires.

Admin users are CTOs, founders, IT admins, security leads, and ops leaders. They care about permissions, correctness, governance, sync health, and adoption.

Power users are team leads and operators who want automated briefs. They care about weekly updates, customer context, meeting prep, incident summaries, and project state.

AI agent users are internal or third-party agents that need reliable company memory through APIs.

## 6. First-Party Workflows

### 6.1 Onboarding Brief

Input: new employee role, team, manager, projects, and permissions.

Output: a personalized onboarding brief containing team structure, active projects, important docs, recent decisions, key people, open tasks, glossary, repos, dashboards, meetings, and recommended reading.

Core graph queries:

Find projects owned by the employee’s team.

Find documents linked to those projects.

Find people connected to those projects.

Find recent decisions affecting those projects.

Find unresolved tasks or incidents related to those projects.

The onboarding brief must include citations and source links for every important claim.

### 6.2 Weekly Digest

Input: team, project, or user scope.

Output: summary of what changed this week across Slack, docs, Jira or Linear, GitHub, meetings, and customer systems.

Sections:

Major decisions

Completed work

Blocked work

Changed deadlines

New risks

Open questions

Relevant incidents

Important customer/account movement

The digest must distinguish between current state and historical changes.

### 6.3 Incident Brief

Input: incident ID, service name, date range, or natural language query.

Output: incident timeline, impacted systems, owners, customer impact, root cause, linked PRs, related alerts, linked Slack channels, postmortem docs, and unresolved follow-ups.

The system must be able to explain how one incident relates to previous incidents through graph traversal.

### 6.4 Meeting Prep

Input: calendar event, attendees, account, project, or topic.

Output: agenda context, previous meeting notes, open action items, relevant decisions, customer history, project updates, and suggested questions.

The system must fetch only sources the requesting user is allowed to access.

### 6.5 Account Summary

Input: customer account name or CRM record.

Output: customer profile, health status, recent tickets, open opportunities, renewal risks, past meetings, product requests, escalations, and responsible internal owners.

This workflow is especially useful for sales, customer success, and founders.

## 7. System Architecture

The system should use a modular architecture.

Core services:

Connector service

Ingestion pipeline

Document parser

Entity extraction service

Relation extraction service

Fact extraction service

Temporal versioning service

Knowledge graph service

Vector index service

Keyword index service

Retrieval orchestrator

Reranking service

Answer generation service

Correction service

Evaluation service

Admin dashboard

Workflow service

API gateway

Audit logging service

Permission service

Recommended MVP architecture:

Frontend: Next.js

Backend API: FastAPI or NestJS

Async jobs: Celery, Temporal, or BullMQ

Queue: Redis or Kafka

Primary database: PostgreSQL

Graph database: Neo4j initially

Vector database: pgvector, Qdrant, or Weaviate

Search index: OpenSearch or Meilisearch

Object storage: S3-compatible storage

LLM orchestration: custom service layer, not tightly coupled to LangChain

Observability: OpenTelemetry, Prometheus, Grafana, Sentry

Deployment: Docker Compose for dev, Kubernetes or ECS for production

## 8. Graph Layer

The graph layer should be first-class, not optional.

Recommended first implementation: Neo4j.

Reason: faster developer velocity, strong Cypher ergonomics, visual debugging, mature property graph model, good fit for entity and relationship traversal.

Recommended enterprise option later: Amazon Neptune.

Reason: managed AWS deployment, enterprise procurement fit, AWS security posture, openCypher/Gremlin/SPARQL support depending on graph model.

The graph must store:

People

Teams

Projects

Documents

Messages

Meetings

Tasks

Tickets

Repos

Pull requests

Commits

Customers

Accounts

Incidents

Services

Decisions

Facts

Claims

Sources

Corrections

Confidence events

Supersession relations

Each node and relationship must store provenance metadata.

Minimum node properties:

id

tenant_id

type

canonical_name

aliases

source_system

source_id

created_at

updated_at

valid_from

valid_to

recorded_from

recorded_to

confidence

status

permissions_hash

embedding_ref

source_url

last_seen_at

Minimum relationship properties:

id

tenant_id

type

source_node_id

target_node_id

valid_from

valid_to

recorded_from

recorded_to

confidence

extraction_method

evidence_source_ids

created_at

updated_at

status

correction_state

## 9. Graph Schema

Core relationship types:

PERSON_MEMBER_OF_TEAM

PERSON_OWNS_PROJECT

PERSON_AUTHORED_DOCUMENT

PERSON_ATTENDED_MEETING

PROJECT_HAS_DOCUMENT

PROJECT_HAS_TASK

PROJECT_DEPENDS_ON_PROJECT

PROJECT_AFFECTS_CUSTOMER

DOCUMENT_MENTIONS_ENTITY

DOCUMENT_SUPERSEDES_DOCUMENT

FACT_SUPPORTED_BY_SOURCE

FACT_CONTRADICTS_FACT

FACT_SUPERSEDES_FACT

FACT_INVALIDATED_BY_CORRECTION

DECISION_MADE_IN_MEETING

DECISION_AFFECTS_PROJECT

TASK_BLOCKS_PROJECT

INCIDENT_AFFECTS_SERVICE

INCIDENT_CAUSED_BY_PR

CUSTOMER_HAS_ACCOUNT_OWNER

ACCOUNT_HAS_OPEN_RISK

MEETING_HAS_ACTION_ITEM

SOURCE_IMPORTED_FROM_CONNECTOR

Example graph query:

Find the latest source of truth for a project decision by traversing from project to decision to supporting facts to sources, filtering only currently valid facts and excluding superseded sources.

## 10. Temporal Supersession Model

The system must support bitemporal semantics.

There are two time dimensions.

Valid time: when the fact was true in the real world.

System time: when the system learned, stored, corrected, or invalidated the fact.

Example:

On June 1, a roadmap doc says Launch Date = July 15.

On June 7, a meeting changes Launch Date = August 1.

On June 8, the system ingests the meeting transcript.

The valid time may be June 7 onward, but the system time begins June 8.

This allows the system to answer:

What do we believe now?

What did we believe on June 5?

When did the knowledge change?

Which source caused the change?

Did the new source supersede the old one?

Temporal states:

current

historical

superseded

contradicted

invalidated

uncertain

draft

stale

Every fact must have temporal fields:

valid_from

valid_to

recorded_from

recorded_to

superseded_by

supersedes

contradicts

invalidation_reason

confidence_at

## Company brain pivot implementation status

| Capability              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Progress |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------: |
| Vector/embedding search | Pluggable embedding and vector-store interfaces; OpenAI and Gemini model-backed embeddings with retry, timeout, batching, dimensionality validation, and query/document task separation; deterministic local provider; in-memory cosine search; PostgreSQL pgvector persistence with HNSW indexing; tenant-scoped fail-closed permission filtering; atomic batch reindexing; correction synchronization; search APIs/CLI; latency telemetry; recall@k, precision@k, and MRR evaluation; unit, workflow, policy, HTTP-provider, and live pgvector contract coverage |     100% |
| Neo4j production graph path | Tenant-scoped persisted node, fact, and relationship reads; complete temporal fact reads after restart; atomic fact and relationship reassignment; entity merge persistence; source ACL hydration; ingestion jobs no longer depend on in-memory maps; live Neo4j contract coverage for corrections, supersession, ingestion, and entity resolution | 100% |
| Cross-source dedup/entity resolution | Normalized-name, alias-overlap, and token-similarity matching across source systems; confidence thresholds; automatic canonical merge; fact and relationship reassignment; audit relationships; tenant/type isolation; idempotency; in-memory and live Neo4j coverage | 100% |
| Graph/workflow permission enforcement | Identity is accepted only from a verified `request.user`; tenant policy derives visible permission hashes; temporal reads, vector retrieval, workflows, citations, conflicts, and corrections enforce source visibility; unknown ACL state fails closed; administrative operations require tenant admin; arbitrary HTTP Cypher is disabled | 100% |
| Production identity and connector ACL synchronization | The API now expects an upstream verified principal, but server-wide OAuth/OIDC middleware, durable policy grants, directory/group synchronization, and connector ACL ingestion are not yet implemented | 0% |

Production configuration is documented in `.env.example`; local Docker Compose uses pgvector with an explicitly allowed deterministic embedding provider unless a hosted provider is configured.

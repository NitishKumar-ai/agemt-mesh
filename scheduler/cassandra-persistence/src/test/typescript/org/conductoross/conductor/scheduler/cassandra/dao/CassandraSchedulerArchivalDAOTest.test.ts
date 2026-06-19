import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CassandraSchedulerArchivalDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/cassandra/dao/CassandraSchedulerArchivalDAO';
import { CassandraProperties } from '../../../../../../../../../../mock';
import { Client } from 'cassandra-driver';
import { WorkflowScheduleExecutionModel, State } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';
import { StartWorkflowRequest } from '../../../../../../../../../../mock';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

describe('CassandraSchedulerArchivalDAOTest', () => {
    const KEYSPACE = "conductor_test";
    let cassandraContainer: StartedTestContainer;
    let session: Client;
    let dao: CassandraSchedulerArchivalDAO;

    beforeAll(async () => {
        cassandraContainer = await new GenericContainer("cassandra:3.11.2")
            .withExposedPorts(9042)
            .start();
        
        session = new Client({
            contactPoints: [cassandraContainer.getHost()],
            localDataCenter: 'datacenter1',
            protocolOptions: { port: cassandraContainer.getMappedPort(9042) }
        });
        await session.connect();
        await session.execute(`CREATE KEYSPACE IF NOT EXISTS ${KEYSPACE} WITH replication = {'class':'SimpleStrategy','replication_factor':1}`);
    }, 60000);

    beforeEach(async () => {
        await session.execute(`DROP TABLE IF EXISTS ${KEYSPACE}.scheduler_archival_executions`);
        await session.execute(`DROP TABLE IF EXISTS ${KEYSPACE}.scheduler_archival_by_id`);
        
        const properties = new CassandraProperties();
        properties.setKeyspace(KEYSPACE);
        dao = new CassandraSchedulerArchivalDAO(session, properties);
        await dao.ensureTables();
    });

    afterAll(async () => {
        if (session) {
            await session.shutdown();
        }
        if (cassandraContainer) {
            await cassandraContainer.stop();
        }
    });

    // =========================================================================
    // Helpers
    // =========================================================================

    function buildExecution(scheduleName: string, executionId: string): WorkflowScheduleExecutionModel {
        const req = new StartWorkflowRequest();
        req.name = "test-wf";
        req.version = 1;

        const model = new WorkflowScheduleExecutionModel();
        model.executionId = executionId;
        model.scheduleName = scheduleName;
        model.workflowName = "test-wf";
        model.workflowId = "wf-" + executionId;
        model.state = "EXECUTED" as State;
        model.scheduledTime = Date.now();
        model.executionTime = Date.now();
        model.startWorkflowRequest = req;
        return model;
    }

    // =========================================================================
    // Save and retrieve
    // =========================================================================

    it('testSaveAndGetById', async () => {
        const model = buildExecution("sched-1", "exec-1");
        await dao.saveExecutionRecord(model);

        const found = await dao.getExecutionById("exec-1");
        expect(found).toBeDefined();
        expect(found!.executionId).toBe("exec-1");
        expect(found!.scheduleName).toBe("sched-1");
        expect(found!.workflowName).toBe("test-wf");
        expect(found!.state).toBe("EXECUTED");
    });

    it('testGetById_notFound_returnsNull', async () => {
        expect(await dao.getExecutionById("no-such-id")).toBeNull();
    });

    it('testSaveAndGetByIds', async () => {
        await dao.saveExecutionRecord(buildExecution("sched-1", "exec-a"));
        await dao.saveExecutionRecord(buildExecution("sched-1", "exec-b"));
        await dao.saveExecutionRecord(buildExecution("sched-2", "exec-c"));

        const result = await dao.getExecutionsByIds(new Set(["exec-a", "exec-c", "no-such"]));
        expect(result.size).toBe(2);
        expect(result.has("exec-a")).toBe(true);
        expect(result.has("exec-c")).toBe(true);
    });

    it('testGetByIds_emptySet_returnsEmpty', async () => {
        expect((await dao.getExecutionsByIds(new Set())).size).toBe(0);
    });

    it('testGetByIds_nullSet_returnsEmpty', async () => {
        expect((await dao.getExecutionsByIds(null as any)).size).toBe(0);
    });

    // =========================================================================
    // Round-trip fidelity
    // =========================================================================

    it('testRoundTrip_allFields', async () => {
        const req = new StartWorkflowRequest();
        req.name = "my-wf";
        req.version = 3;

        const model = new WorkflowScheduleExecutionModel();
        model.executionId = "rt-exec";
        model.scheduleName = "rt-sched";
        model.workflowName = "my-wf";
        model.workflowId = "wf-instance-789";
        model.reason = "Timeout exceeded";
        model.stackTrace = "java.lang.RuntimeException: Timeout\n\tat Foo.bar(Foo.java:42)";
        model.state = "FAILED" as State;
        model.scheduledTime = 1000000;
        model.executionTime = 1000500;
        model.startWorkflowRequest = req;

        await dao.saveExecutionRecord(model);

        const found = await dao.getExecutionById("rt-exec");
        expect(found).toBeDefined();
        expect(found!.scheduleName).toBe("rt-sched");
        expect(found!.workflowName).toBe("my-wf");
        expect(found!.workflowId).toBe("wf-instance-789");
        expect(found!.reason).toBe("Timeout exceeded");
        expect(found!.stackTrace!.includes("RuntimeException")).toBe(true);
        expect(found!.state).toBe("FAILED");
        expect(found!.scheduledTime).toBe(1000000);
        expect(found!.executionTime).toBe(1000500);
        expect(found!.startWorkflowRequest).toBeDefined();
        expect(found!.startWorkflowRequest!.name).toBe("my-wf");
        expect(found!.startWorkflowRequest!.version).toBe(3);
    });

    // =========================================================================
    // Search
    // =========================================================================

    it('testSearch_byScheduleName', async () => {
        await dao.saveExecutionRecord(buildExecution("sched-a", "e1"));
        await dao.saveExecutionRecord(buildExecution("sched-a", "e2"));
        await dao.saveExecutionRecord(buildExecution("sched-b", "e3"));

        const r2 = await dao.searchScheduledExecutions("sched-a", "", 0, 10, []);
        expect(r2.totalHits).toBe(2);
        expect(r2.results.includes("e1")).toBe(true);
        expect(r2.results.includes("e2")).toBe(true);
    });

    it('testSearch_byWorkflowName', async () => {
        const e1 = buildExecution("wn-sched", "e-wn1");
        e1.workflowName = "payment-processor";
        await dao.saveExecutionRecord(e1);

        const e2 = buildExecution("wn-sched", "e-wn2");
        e2.workflowName = "order-fulfillment";
        await dao.saveExecutionRecord(e2);

        const result = await dao.searchScheduledExecutions("workflowName=payment", "", 0, 10, []);
        expect(result.totalHits).toBe(1);
        expect(result.results[0]).toBe("e-wn1");
    });

    it('testSearch_byExecutionId', async () => {
        await dao.saveExecutionRecord(buildExecution("eid-sched", "exact-id-123"));
        await dao.saveExecutionRecord(buildExecution("eid-sched", "exact-id-456"));

        const result = await dao.searchScheduledExecutions("executionId=exact-id-123", "", 0, 10, []);
        expect(result.totalHits).toBe(1);
        expect(result.results[0]).toBe("exact-id-123");
    });

    it('testSearch_wildcard_returnsAll', async () => {
        await dao.saveExecutionRecord(buildExecution("sched-1", "e1"));
        await dao.saveExecutionRecord(buildExecution("sched-2", "e2"));

        const result = await dao.searchScheduledExecutions("", "*", 0, 10, []);
        expect(result.totalHits).toBe(2);
    });

    it('testSearch_pagination', async () => {
        for (let i = 0; i < 5; i++) {
            const exec = buildExecution("page-sched", "page-" + i);
            exec.scheduledTime = Date.now() + i * 1000;
            await dao.saveExecutionRecord(exec);
        }

        const page1 = await dao.searchScheduledExecutions("page-sched", "", 0, 2, []);
        expect(page1.totalHits).toBe(5);
        expect(page1.results.length).toBe(2);

        const page2 = await dao.searchScheduledExecutions("page-sched", "", 2, 2, []);
        expect(page2.totalHits).toBe(5);
        expect(page2.results.length).toBe(2);
    });

    // =========================================================================
    // Cleanup
    // =========================================================================

    it('testCleanupOldRecords', async () => {
        for (let i = 0; i < 10; i++) {
            const exec = buildExecution("cleanup-sched", "cleanup-" + i);
            exec.scheduledTime = 1000000 + i * 1000;
            await dao.saveExecutionRecord(exec);
        }

        await dao.cleanupOldRecords(3, 5);

        const result = await dao.searchScheduledExecutions("cleanup-sched", "", 0, 20, []);
        expect(result.totalHits).toBe(3);
    });

    it('testCleanupOldRecords_belowThreshold_noOp', async () => {
        for (let i = 0; i < 3; i++) {
            const exec = buildExecution("noclean-sched", "noclean-" + i);
            exec.scheduledTime = 1000000 + i * 1000;
            await dao.saveExecutionRecord(exec);
        }

        await dao.cleanupOldRecords(2, 5);

        const result = await dao.searchScheduledExecutions("noclean-sched", "", 0, 20, []);
        expect(result.totalHits).toBe(3);
    });
});

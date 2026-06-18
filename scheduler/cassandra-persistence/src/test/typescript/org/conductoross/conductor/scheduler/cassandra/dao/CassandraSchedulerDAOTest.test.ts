import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CassandraSchedulerDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/cassandra/dao/CassandraSchedulerDAO';
import { CassandraProperties } from '../../../../../../../../../../mock';
import { Client } from 'cassandra-driver';
import { WorkflowScheduleModel } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/scheduler/model/WorkflowScheduleModel';
import { WorkflowScheduleExecutionModel, State } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';
import { StartWorkflowRequest } from '../../../../../../../../../../mock';
import { v4 as uuidv4 } from 'uuid';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

describe('CassandraSchedulerDAOTest', () => {
    const KEYSPACE = "conductor_test";
    let cassandraContainer: StartedTestContainer;
    let session: Client;
    let dao: CassandraSchedulerDAO;

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
        await session.execute(`DROP TABLE IF EXISTS ${KEYSPACE}.scheduler_schedules`);
        await session.execute(`DROP TABLE IF EXISTS ${KEYSPACE}.scheduler_executions`);
        await session.execute(`DROP TABLE IF EXISTS ${KEYSPACE}.scheduler_exec_by_schedule`);
        await session.execute(`DROP TABLE IF EXISTS ${KEYSPACE}.scheduler_exec_by_state`);
        await session.execute(`DROP TABLE IF EXISTS ${KEYSPACE}.scheduler_sched_by_workflow`);

        const properties = new CassandraProperties();
        properties.setKeyspace(KEYSPACE);
        dao = new CassandraSchedulerDAO(session, properties);
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

    function buildSchedule(name: string, workflowName: string): WorkflowScheduleModel {
        const startReq = new StartWorkflowRequest();
        startReq.name = workflowName;
        startReq.version = 1;

        const schedule = new WorkflowScheduleModel();
        schedule.name = name;
        schedule.cronExpression = "0 0 9 * * MON-FRI";
        schedule.zoneId = "UTC";
        schedule.startWorkflowRequest = startReq;
        schedule.paused = false;
        schedule.createTime = Date.now();
        return schedule;
    }

    function buildExecution(scheduleName: string): WorkflowScheduleExecutionModel {
        const exec = new WorkflowScheduleExecutionModel();
        exec.executionId = uuidv4();
        exec.scheduleName = scheduleName;
        exec.scheduledTime = Date.now();
        exec.executionTime = Date.now();
        exec.state = "POLLED" as State;
        exec.zoneId = "UTC";
        return exec;
    }

    // =========================================================================
    // Schedule CRUD
    // =========================================================================

    it('testSaveAndFindSchedule', async () => {
        const schedule = buildSchedule("test-schedule", "my-workflow");
        await dao.updateSchedule(schedule);

        const found = await dao.findScheduleByName("test-schedule");

        expect(found).toBeDefined();
        expect(found!.name).toBe("test-schedule");
        expect(found!.startWorkflowRequest!.name).toBe("my-workflow");
        expect(found!.cronExpression).toBe("0 0 9 * * MON-FRI");
        expect(found!.zoneId).toBe("UTC");
    });

    it('testFindScheduleByName_notFound_returnsNull', async () => {
        expect(await dao.findScheduleByName("no-such-schedule")).toBeNull();
    });

    it('testUpdateSchedule_upserts', async () => {
        const schedule = buildSchedule("upsert-schedule", "workflow-v1");
        await dao.updateSchedule(schedule);

        schedule.cronExpression = "0 0 10 * * *";
        await dao.updateSchedule(schedule);

        const found = await dao.findScheduleByName("upsert-schedule");
        expect(found!.cronExpression).toBe("0 0 10 * * *");
    });

    it('testGetAllSchedules', async () => {
        await dao.updateSchedule(buildSchedule("sched-a", "wf-a"));
        await dao.updateSchedule(buildSchedule("sched-b", "wf-b"));
        await dao.updateSchedule(buildSchedule("sched-c", "wf-c"));

        const all = await dao.getAllSchedules();
        expect(all.length).toBe(3);
    });

    it('testFindAllSchedulesByWorkflow', async () => {
        await dao.updateSchedule(buildSchedule("s1", "target-wf"));
        await dao.updateSchedule(buildSchedule("s2", "target-wf"));
        await dao.updateSchedule(buildSchedule("s3", "other-wf"));

        const results = await dao.findAllSchedules("target-wf");
        expect(results.length).toBe(2);
        expect(results.every(s => s.startWorkflowRequest!.name === "target-wf")).toBe(true);
    });

    it('testFindAllByNames', async () => {
        await dao.updateSchedule(buildSchedule("find-a", "wf-a"));
        await dao.updateSchedule(buildSchedule("find-b", "wf-b"));
        await dao.updateSchedule(buildSchedule("find-c", "wf-c"));

        const result = await dao.findAllByNames(new Set(["find-a", "find-c", "no-such-schedule"]));
        expect(result.size).toBe(2);
        expect(result.has("find-a")).toBe(true);
        expect(result.has("find-c")).toBe(true);
    });

    it('testFindAllByNames_emptySet_returnsEmpty', async () => {
        expect((await dao.findAllByNames(new Set())).size).toBe(0);
    });

    it('testFindAllByNames_nullSet_returnsEmpty', async () => {
        expect((await dao.findAllByNames(null as any)).size).toBe(0);
    });

    it('testDeleteSchedule_removesScheduleAndExecutions', async () => {
        await dao.updateSchedule(buildSchedule("to-delete", "some-wf"));
        const exec = buildExecution("to-delete");
        await dao.saveExecutionRecord(exec);

        await dao.deleteWorkflowSchedule("to-delete");

        expect(await dao.findScheduleByName("to-delete")).toBeNull();
        expect(await dao.readExecutionRecord(exec.executionId)).toBeNull();
    });

    it('testDeleteSchedule_nonExistent_doesNotThrow', async () => {
        await dao.deleteWorkflowSchedule("does-not-exist");
    });

    // =========================================================================
    // JSON round-trip fidelity
    // =========================================================================

    it('testScheduleJsonRoundTrip_allFields', async () => {
        const schedule = buildSchedule("round-trip-schedule", "round-trip-wf");
        schedule.zoneId = "America/New_York";
        schedule.paused = true;
        schedule.pausedReason = "maintenance window";
        schedule.scheduleStartTime = 1000000;
        schedule.scheduleEndTime = 2000000;
        schedule.runCatchupScheduleInstances = true;
        schedule.createTime = 12345;
        schedule.updatedTime = 67890;
        schedule.createdBy = "alice";
        schedule.updatedBy = "bob";
        schedule.description = "Daily business hours schedule";
        schedule.nextRunTime = 99999;
        await dao.updateSchedule(schedule);

        const found = await dao.findScheduleByName("round-trip-schedule");

        expect(found).toBeDefined();
        expect(found!.zoneId).toBe("America/New_York");
        expect(found!.paused).toBe(true);
        expect(found!.pausedReason).toBe("maintenance window");
        expect(found!.scheduleStartTime).toBe(1000000);
        expect(found!.scheduleEndTime).toBe(2000000);
        expect(found!.runCatchupScheduleInstances).toBe(true);
        expect(found!.createTime).toBe(12345);
        expect(found!.updatedTime).toBe(67890);
        expect(found!.createdBy).toBe("alice");
        expect(found!.updatedBy).toBe("bob");
        expect(found!.description).toBe("Daily business hours schedule");
        expect(found!.nextRunTime).toBe(99999);
    });

    it('testExecutionJsonRoundTrip_allFields', async () => {
        await dao.updateSchedule(buildSchedule("exec-rt-schedule", "exec-rt-wf"));

        const req = new StartWorkflowRequest();
        req.name = "exec-rt-wf";
        req.version = 2;

        const exec = buildExecution("exec-rt-schedule");
        exec.workflowId = "wf-instance-456";
        exec.workflowName = "exec-rt-wf";
        exec.reason = "Something went wrong";
        exec.stackTrace = "java.lang.RuntimeException: Something went wrong\n\tat Foo.bar(Foo.java:42)";
        exec.state = "FAILED" as State;
        exec.startWorkflowRequest = req;
        await dao.saveExecutionRecord(exec);

        const found = await dao.readExecutionRecord(exec.executionId);

        expect(found).toBeDefined();
        expect(found!.workflowId).toBe("wf-instance-456");
        expect(found!.workflowName).toBe("exec-rt-wf");
        expect(found!.reason).toBe("Something went wrong");
        expect(found!.stackTrace).toBeDefined();
        expect(found!.stackTrace!.includes("RuntimeException")).toBe(true);
        expect(found!.state).toBe("FAILED");
        expect(found!.startWorkflowRequest).toBeDefined();
        expect(found!.startWorkflowRequest!.name).toBe("exec-rt-wf");
        expect(found!.startWorkflowRequest!.version).toBe(2);
    });

    // =========================================================================
    // Execution tracking
    // =========================================================================

    it('testSaveAndReadExecutionRecord', async () => {
        await dao.updateSchedule(buildSchedule("exec-test", "wf"));
        const exec = buildExecution("exec-test");
        await dao.saveExecutionRecord(exec);

        const found = await dao.readExecutionRecord(exec.executionId);
        expect(found).toBeDefined();
        expect(found!.executionId).toBe(exec.executionId);
        expect(found!.scheduleName).toBe("exec-test");
        expect(found!.state).toBe("POLLED");
    });

    it('testSaveExecutionRecord_idempotent', async () => {
        await dao.updateSchedule(buildSchedule("idem-test", "wf"));
        const exec = buildExecution("idem-test");
        await dao.saveExecutionRecord(exec);
        await dao.saveExecutionRecord(exec);

        const pending = await dao.getPendingExecutionRecordIds();
        expect(pending.length).toBe(1);
    });

    it('testUpdateExecutionRecord_transitionToExecuted', async () => {
        await dao.updateSchedule(buildSchedule("state-test", "wf"));
        const exec = buildExecution("state-test");
        await dao.saveExecutionRecord(exec);

        exec.state = "EXECUTED" as State;
        exec.workflowId = "conductor-wf-123";
        await dao.saveExecutionRecord(exec);

        const found = await dao.readExecutionRecord(exec.executionId);
        expect(found!.state).toBe("EXECUTED");
        expect(found!.workflowId).toBe("conductor-wf-123");
    });

    it('testRemoveExecutionRecord', async () => {
        await dao.updateSchedule(buildSchedule("remove-exec", "wf"));
        const exec = buildExecution("remove-exec");
        await dao.saveExecutionRecord(exec);

        await dao.removeExecutionRecord(exec.executionId);

        expect(await dao.readExecutionRecord(exec.executionId)).toBeNull();
    });

    it('testGetPendingExecutionRecordIds', async () => {
        await dao.updateSchedule(buildSchedule("pending-test", "wf"));

        const polled1 = buildExecution("pending-test");
        const polled2 = buildExecution("pending-test");
        const executed = buildExecution("pending-test");
        executed.state = "EXECUTED" as State;

        await dao.saveExecutionRecord(polled1);
        await dao.saveExecutionRecord(polled2);
        await dao.saveExecutionRecord(executed);

        const pendingIds = await dao.getPendingExecutionRecordIds();
        expect(pendingIds.length).toBe(2);
        expect(pendingIds.includes(polled1.executionId)).toBe(true);
        expect(pendingIds.includes(polled2.executionId)).toBe(true);
    });

    it('testGetPendingExecutionRecordIds_afterTransition', async () => {
        await dao.updateSchedule(buildSchedule("transition-test", "wf"));

        const exec = buildExecution("transition-test");
        await dao.saveExecutionRecord(exec);
        expect((await dao.getPendingExecutionRecordIds()).includes(exec.executionId)).toBe(true);

        exec.state = "EXECUTED" as State;
        await dao.saveExecutionRecord(exec);

        expect((await dao.getPendingExecutionRecordIds()).includes(exec.executionId)).toBe(false);
    });

    // =========================================================================
    // Next-run time management
    // =========================================================================

    it('testSetAndGetNextRunTime', async () => {
        await dao.updateSchedule(buildSchedule("next-run-test", "wf"));

        const epochMillis = Date.now() + 60000;
        await dao.setNextRunTimeInEpoch("next-run-test", epochMillis);

        expect(await dao.getNextRunTimeInEpoch("next-run-test")).toBe(epochMillis);
    });

    it('testGetNextRunTime_notSet_returnsMinusOne', async () => {
        await dao.updateSchedule(buildSchedule("no-next-run", "wf"));
        expect(await dao.getNextRunTimeInEpoch("no-next-run")).toBe(-1);
    });

    it('testGetNextRunTime_nonExistent_returnsMinusOne', async () => {
        expect(await dao.getNextRunTimeInEpoch("non-existent-schedule")).toBe(-1);
    });

    // =========================================================================
    // Search
    // =========================================================================

    it('testSearchSchedules_byWorkflowName', async () => {
        await dao.updateSchedule(buildSchedule("search-1", "search-wf"));
        await dao.updateSchedule(buildSchedule("search-2", "search-wf"));
        await dao.updateSchedule(buildSchedule("search-3", "other-wf"));

        const result = await dao.searchSchedules("search-wf", undefined, undefined, undefined, 0, 10, undefined);
        expect(result.totalHits).toBe(2);
    });

    it('testSearchSchedules_byPaused', async () => {
        const paused = buildSchedule("paused-sched", "wf");
        paused.paused = true;
        await dao.updateSchedule(paused);
        await dao.updateSchedule(buildSchedule("active-sched", "wf"));

        const result = await dao.searchSchedules(undefined, undefined, true, undefined, 0, 10, undefined);
        expect(result.totalHits).toBe(1);
        expect(result.results[0].name).toBe("paused-sched");
    });

    it('testSearchSchedules_pagination', async () => {
        for (let i = 0; i < 5; i++) {
            await dao.updateSchedule(buildSchedule("page-" + i, "wf"));
        }

        const page1 = await dao.searchSchedules(undefined, undefined, undefined, undefined, 0, 2, undefined);
        expect(page1.totalHits).toBe(5);
        expect(page1.results.length).toBe(2);

        const page2 = await dao.searchSchedules(undefined, undefined, undefined, undefined, 2, 2, undefined);
        expect(page2.totalHits).toBe(5);
        expect(page2.results.length).toBe(2);
    });

    // =========================================================================
    // Volume
    // =========================================================================

    it('testVolume_getAllSchedules_largeCount', async () => {
        const count = 100;
        for (let i = 0; i < count; i++) {
            await dao.updateSchedule(buildSchedule("volume-sched-" + i, "wf-" + (i % 10)));
        }

        const all = await dao.getAllSchedules();
        expect(all.length).toBe(count);
    });
});

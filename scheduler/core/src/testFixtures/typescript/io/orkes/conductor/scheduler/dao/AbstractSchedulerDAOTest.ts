import { describe, it, expect, beforeEach } from 'vitest';

export abstract class AbstractSchedulerDAOTest {
    protected abstract dao(): any;
    protected abstract dataSource(): any;

    public runTests() {
        describe('AbstractSchedulerDAOTest', () => {
            beforeEach(async () => {
                const conn = await this.dataSource().getConnection();
                try {
                    await conn.query("DELETE FROM scheduler_execution");
                    await conn.query("DELETE FROM scheduler");
                    await conn.query("DELETE FROM workflow_scheduled_executions");
                } finally {
                    conn.release();
                }
            });

            const buildSchedule = (name: string, workflowName: string) => {
                return {
                    name,
                    cronExpression: "0 0 9 * * MON-FRI",
                    zoneId: "UTC",
                    startWorkflowRequest: { name: workflowName, version: 1 },
                    paused: false,
                    createTime: Date.now()
                };
            };

            const buildExecution = (scheduleName: string, executionId: string = Math.random().toString()) => {
                return {
                    executionId,
                    scheduleName,
                    scheduledTime: Date.now(),
                    executionTime: Date.now(),
                    state: 'POLLED',
                    zoneId: "UTC"
                };
            };

            it('testSaveAndFindSchedule', async () => {
                const schedule = buildSchedule("test-schedule", "my-workflow");
                await this.dao().updateSchedule(schedule);

                const found = await this.dao().findScheduleByName("test-schedule");

                expect(found).toBeDefined();
                expect(found.name).toBe("test-schedule");
                expect(found.startWorkflowRequest.name).toBe("my-workflow");
                expect(found.cronExpression).toBe("0 0 9 * * MON-FRI");
                expect(found.zoneId).toBe("UTC");
            });

            it('testFindScheduleByName_notFound_returnsNull', async () => {
                const found = await this.dao().findScheduleByName("no-such-schedule");
                expect(found).toBeNull();
            });

            it('testUpdateSchedule_upserts', async () => {
                const schedule = buildSchedule("upsert-schedule", "workflow-v1");
                await this.dao().updateSchedule(schedule);

                schedule.cronExpression = "0 0 10 * * *";
                await this.dao().updateSchedule(schedule);

                const found = await this.dao().findScheduleByName("upsert-schedule");
                expect(found.cronExpression).toBe("0 0 10 * * *");
            });

            it('testGetAllSchedules', async () => {
                await this.dao().updateSchedule(buildSchedule("sched-a", "wf-a"));
                await this.dao().updateSchedule(buildSchedule("sched-b", "wf-b"));
                await this.dao().updateSchedule(buildSchedule("sched-c", "wf-c"));

                const results = await this.dao().getAllSchedules();
                expect(results.length).toBe(3);
            });

            it('testFindAllSchedulesByWorkflow', async () => {
                await this.dao().updateSchedule(buildSchedule("s1", "target-wf"));
                await this.dao().updateSchedule(buildSchedule("s2", "target-wf"));
                await this.dao().updateSchedule(buildSchedule("s3", "other-wf"));

                const results = await this.dao().findAllSchedules("target-wf");
                expect(results.length).toBe(2);
                expect(results.every((s: any) => s.startWorkflowRequest.name === "target-wf")).toBe(true);
            });

            it('testFindAllByNames', async () => {
                await this.dao().updateSchedule(buildSchedule("find-a", "wf-a"));
                await this.dao().updateSchedule(buildSchedule("find-b", "wf-b"));
                await this.dao().updateSchedule(buildSchedule("find-c", "wf-c"));

                const result = await this.dao().findAllByNames(new Set(["find-a", "find-c", "no-such-schedule"]));
                expect(result.size).toBe(2);
                expect(result.has("find-a")).toBe(true);
                expect(result.has("find-c")).toBe(true);
                expect(result.has("find-b")).toBe(false);
                expect(result.has("no-such-schedule")).toBe(false);
            });

            it('testFindAllByNames_emptySet_returnsEmpty', async () => {
                const result = await this.dao().findAllByNames(new Set());
                expect(result).toBeDefined();
                expect(result.size).toBe(0);
            });

            it('testFindAllByNames_nullSet_returnsEmpty', async () => {
                const result = await this.dao().findAllByNames(null);
                expect(result).toBeDefined();
                expect(result.size).toBe(0);
            });

            it('testDeleteSchedule_removesScheduleAndExecutions', async () => {
                await this.dao().updateSchedule(buildSchedule("to-delete", "some-wf"));
                const exec = buildExecution("to-delete");
                await this.dao().saveExecutionRecord(exec);

                await this.dao().deleteWorkflowSchedule("to-delete");

                expect(await this.dao().findScheduleByName("to-delete")).toBeNull();
                expect(await this.dao().readExecutionRecord(exec.executionId)).toBeNull();
            });

            it('testDeleteSchedule_cascadesMultipleExecutions', async () => {
                await this.dao().updateSchedule(buildSchedule("cascade-delete", "some-wf"));
                for (let i = 0; i < 5; i++) {
                    await this.dao().saveExecutionRecord(buildExecution("cascade-delete"));
                }

                await this.dao().deleteWorkflowSchedule("cascade-delete");

                expect(await this.dao().findScheduleByName("cascade-delete")).toBeNull();
                const pending = await this.dao().getPendingExecutionRecordIds();
                expect(pending.length).toBe(0);
            });

            it('testDeleteSchedule_nonExistent_doesNotThrow', async () => {
                await this.dao().deleteWorkflowSchedule("does-not-exist");
            });

            it('testScheduleJsonRoundTrip_allFields', async () => {
                const schedule: any = buildSchedule("round-trip-schedule", "round-trip-wf");
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
                
                await this.dao().updateSchedule(schedule);

                const found = await this.dao().findScheduleByName("round-trip-schedule");

                expect(found).toBeDefined();
                expect(found.zoneId).toBe("America/New_York");
                expect(found.paused).toBe(true);
                expect(found.pausedReason).toBe("maintenance window");
                expect(found.scheduleStartTime).toBe(1000000);
                expect(found.scheduleEndTime).toBe(2000000);
                expect(found.runCatchupScheduleInstances).toBe(true);
                expect(found.createTime).toBe(12345);
                expect(found.updatedTime).toBe(67890);
                expect(found.createdBy).toBe("alice");
                expect(found.updatedBy).toBe("bob");
                expect(found.description).toBe("Daily business hours schedule");
                expect(found.nextRunTime).toBe(99999);
            });

            it('testExecutionJsonRoundTrip_allFields', async () => {
                await this.dao().updateSchedule(buildSchedule("exec-rt-schedule", "exec-rt-wf"));

                const req = { name: "exec-rt-wf", version: 2 };
                const exec: any = buildExecution("exec-rt-schedule");
                exec.workflowId = "wf-instance-456";
                exec.workflowName = "exec-rt-wf";
                exec.reason = "Something went wrong";
                exec.stackTrace = "java.lang.RuntimeException: Something went wrong\n\tat Foo.bar(Foo.java:42)";
                exec.state = "FAILED";
                exec.startWorkflowRequest = req;
                
                await this.dao().saveExecutionRecord(exec);

                const found = await this.dao().readExecutionRecord(exec.executionId);

                expect(found).toBeDefined();
                expect(found.workflowId).toBe("wf-instance-456");
                expect(found.workflowName).toBe("exec-rt-wf");
                expect(found.reason).toBe("Something went wrong");
                expect(found.stackTrace).toBeDefined();
                expect(found.stackTrace).toContain("RuntimeException");
                expect(found.state).toBe("FAILED");
                expect(found.startWorkflowRequest).toBeDefined();
                expect(found.startWorkflowRequest.name).toBe("exec-rt-wf");
                expect(found.startWorkflowRequest.version).toBe(2);
            });

            it('testSaveAndReadExecutionRecord', async () => {
                await this.dao().updateSchedule(buildSchedule("exec-test", "wf"));
                const exec = buildExecution("exec-test");
                await this.dao().saveExecutionRecord(exec);

                const found = await this.dao().readExecutionRecord(exec.executionId);
                expect(found).toBeDefined();
                expect(found.executionId).toBe(exec.executionId);
                expect(found.scheduleName).toBe("exec-test");
                expect(found.state).toBe("POLLED");
            });

            it('testSaveExecutionRecord_idempotent', async () => {
                await this.dao().updateSchedule(buildSchedule("idem-test", "wf"));
                const exec = buildExecution("idem-test");
                await this.dao().saveExecutionRecord(exec);
                await this.dao().saveExecutionRecord(exec);

                const pending = await this.dao().getPendingExecutionRecordIds();
                expect(pending.length).toBe(1);
            });

            it('testUpdateExecutionRecord_transitionToExecuted', async () => {
                await this.dao().updateSchedule(buildSchedule("state-test", "wf"));
                const exec: any = buildExecution("state-test");
                await this.dao().saveExecutionRecord(exec);

                exec.state = "EXECUTED";
                exec.workflowId = "conductor-wf-123";
                await this.dao().saveExecutionRecord(exec);

                const found = await this.dao().readExecutionRecord(exec.executionId);
                expect(found.state).toBe("EXECUTED");
                expect(found.workflowId).toBe("conductor-wf-123");
            });

            it('testUpdateExecutionRecord_transitionToFailed', async () => {
                await this.dao().updateSchedule(buildSchedule("fail-test", "wf"));
                const exec: any = buildExecution("fail-test");
                await this.dao().saveExecutionRecord(exec);

                exec.state = "FAILED";
                exec.reason = "No such workflow defined. name=missing-wf, version=1";
                exec.stackTrace = "com.netflix.conductor.core.exception.NotFoundException: No such workflow\n\tat ...";
                await this.dao().saveExecutionRecord(exec);

                const found = await this.dao().readExecutionRecord(exec.executionId);
                expect(found.state).toBe("FAILED");
                expect(found.reason).toBeDefined();
                expect(found.reason).toContain("missing-wf");
                expect(found.stackTrace).toBeDefined();
            });

            it('testRemoveExecutionRecord', async () => {
                await this.dao().updateSchedule(buildSchedule("remove-exec", "wf"));
                const exec = buildExecution("remove-exec");
                await this.dao().saveExecutionRecord(exec);

                await this.dao().removeExecutionRecord(exec.executionId);

                expect(await this.dao().readExecutionRecord(exec.executionId)).toBeNull();
            });

            it('testGetPendingExecutionRecordIds', async () => {
                await this.dao().updateSchedule(buildSchedule("pending-test", "wf"));

                const polled1 = buildExecution("pending-test");
                const polled2 = buildExecution("pending-test");
                const executed: any = buildExecution("pending-test");
                executed.state = "EXECUTED";

                await this.dao().saveExecutionRecord(polled1);
                await this.dao().saveExecutionRecord(polled2);
                await this.dao().saveExecutionRecord(executed);

                const pendingIds = await this.dao().getPendingExecutionRecordIds();
                expect(pendingIds.length).toBe(2);
                expect(pendingIds).toContain(polled1.executionId);
                expect(pendingIds).toContain(polled2.executionId);
            });

            it('testGetPendingExecutionRecordIds_afterTransition', async () => {
                await this.dao().updateSchedule(buildSchedule("transition-test", "wf"));

                const exec: any = buildExecution("transition-test");
                await this.dao().saveExecutionRecord(exec);
                let pendingIds = await this.dao().getPendingExecutionRecordIds();
                expect(pendingIds).toContain(exec.executionId);

                exec.state = "EXECUTED";
                await this.dao().saveExecutionRecord(exec);

                pendingIds = await this.dao().getPendingExecutionRecordIds();
                expect(pendingIds).not.toContain(exec.executionId);
            });

            it('testSetAndGetNextRunTime', async () => {
                await this.dao().updateSchedule(buildSchedule("next-run-test", "wf"));

                const epochMillis = Date.now() + 60000;
                await this.dao().setNextRunTimeInEpoch("next-run-test", epochMillis);

                expect(await this.dao().getNextRunTimeInEpoch("next-run-test")).toBe(epochMillis);
            });

            it('testGetNextRunTime_notSet_returnsMinusOne', async () => {
                await this.dao().updateSchedule(buildSchedule("no-next-run", "wf"));
                expect(await this.dao().getNextRunTimeInEpoch("no-next-run")).toBe(-1);
            });

            it('testUpdateSchedule_resetsNextRunTime', async () => {
                const schedule: any = buildSchedule("nrt-reset-test", "wf");
                await this.dao().updateSchedule(schedule);

                const epoch = Date.now() + 60000;
                await this.dao().setNextRunTimeInEpoch("nrt-reset-test", epoch);
                expect(await this.dao().getNextRunTimeInEpoch("nrt-reset-test")).toBe(epoch);

                schedule.cronExpression = "0 0 10 * * *";
                schedule.nextRunTime = null;
                await this.dao().updateSchedule(schedule);

                expect(await this.dao().getNextRunTimeInEpoch("nrt-reset-test")).toBe(-1);
            });

            it('testVolume_getAllSchedules_largeCount', async () => {
                const count = 100;
                for (let i = 0; i < count; i++) {
                    await this.dao().updateSchedule(buildSchedule(`volume-sched-${i}`, `wf-${i % 10}`));
                }

                const all = await this.dao().getAllSchedules();
                expect(all.length).toBe(count);
            });

            it('testConcurrentUpserts_sameSchedule', async () => {
                await this.dao().updateSchedule(buildSchedule("concurrent-sched", "wf-initial"));

                const threadCount = 10;
                const promises = [];

                for (let i = 0; i < threadCount; i++) {
                    promises.push(this.dao().updateSchedule(buildSchedule("concurrent-sched", `wf-${i}`)));
                }

                await Promise.all(promises);

                const all = await this.dao().getAllSchedules();
                expect(all.length).toBe(1);
                expect(all[0].name).toBe("concurrent-sched");
            });

            it('testFindAllSchedules_caseSensitive', async () => {
                await this.dao().updateSchedule(buildSchedule("case-sched", "MyWorkflow"));

                expect((await this.dao().findAllSchedules("MyWorkflow")).length).toBe(1);
                expect((await this.dao().findAllSchedules("myworkflow")).length).toBe(0);
                expect((await this.dao().findAllSchedules("MYWORKFLOW")).length).toBe(0);
            });

            it('testFindAllByNames_largeSet', async () => {
                const allNames = new Set<string>();
                for (let i = 0; i < 50; i++) {
                    const name = `large-set-${i}`;
                    await this.dao().updateSchedule(buildSchedule(name, "wf"));
                    allNames.add(name);
                }
                const queryNames = new Set<string>(allNames);
                for (let i = 50; i < 100; i++) {
                    queryNames.add(`large-set-${i}`);
                }
                const result = await this.dao().findAllByNames(queryNames);
                expect(result.size).toBe(50);
                for (const name of allNames) {
                    expect(result.has(name)).toBe(true);
                }
            });

            it('testGetNextRunTime_nonExistentSchedule_returnsMinusOne', async () => {
                expect(await this.dao().getNextRunTimeInEpoch("non-existent-schedule")).toBe(-1);
            });

            it('testSetNextRunTime_arbitraryKey_persists', async () => {
                const epoch = Date.now() + 60000;
                await this.dao().setNextRunTimeInEpoch("non-existent-schedule", epoch);
                expect(await this.dao().getNextRunTimeInEpoch("non-existent-schedule")).toBe(epoch);
            });

            it('testSetAndGetNextRunTime_withMultiCronPayloadKey', async () => {
                const multiCronPayloadKey = "{\"name\":\"multi-cron-sched\",\"cron\":\"0 0 8 * * ? UTC\",\"id\":0}";
                const futureEpoch = Date.now() + 3600000; 

                await this.dao().setNextRunTimeInEpoch(multiCronPayloadKey, futureEpoch);

                const stored = await this.dao().getNextRunTimeInEpoch(multiCronPayloadKey);
                expect(stored).toBe(futureEpoch);
            });
        });
    }
}

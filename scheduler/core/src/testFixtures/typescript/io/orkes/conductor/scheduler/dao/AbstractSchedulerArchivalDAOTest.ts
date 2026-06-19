import { describe, it, expect } from 'vitest';

export abstract class AbstractSchedulerArchivalDAOTest {
    protected abstract archivalDao(): any;

    private buildExecution(scheduleName: string, executionId: string): any {
        return {
            executionId,
            scheduleName,
            workflowName: "test-wf",
            workflowId: "wf-" + executionId,
            state: "EXECUTED",
            scheduledTime: Date.now(),
            executionTime: Date.now(),
            startWorkflowRequest: { name: "test-wf", version: 1 }
        };
    }

    public runTests() {
        describe('AbstractSchedulerArchivalDAOTest', () => {
            it('testSaveAndGetById', async () => {
                const model = this.buildExecution("sched-1", "exec-1");
                await this.archivalDao().saveExecutionRecord(model);

                const found = await this.archivalDao().getExecutionById("exec-1");
                expect(found).toBeDefined();
                expect(found.executionId).toBe("exec-1");
                expect(found.scheduleName).toBe("sched-1");
                expect(found.workflowName).toBe("test-wf");
                expect(found.state).toBe("EXECUTED");
            });

            it('testGetById_notFound_returnsNull', async () => {
                const found = await this.archivalDao().getExecutionById("no-such-id");
                expect(found).toBeNull();
            });

            it('testSaveAndGetByIds', async () => {
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-1", "exec-a"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-1", "exec-b"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-2", "exec-c"));

                const result = await this.archivalDao().getExecutionsByIds(new Set(["exec-a", "exec-c", "no-such"]));
                expect(result.size).toBe(2);
                expect(result.has("exec-a")).toBe(true);
                expect(result.has("exec-c")).toBe(true);
            });

            it('testGetByIds_emptySet_returnsEmpty', async () => {
                const result = await this.archivalDao().getExecutionsByIds(new Set());
                expect(result.size).toBe(0);
            });

            it('testGetByIds_nullSet_returnsEmpty', async () => {
                const result = await this.archivalDao().getExecutionsByIds(null);
                expect(result.size).toBe(0);
            });

            it('testSaveExecutionRecord_upsert', async () => {
                const model: any = this.buildExecution("upsert-sched", "upsert-exec");
                await this.archivalDao().saveExecutionRecord(model);

                model.reason = "updated reason";
                model.state = "FAILED";
                await this.archivalDao().saveExecutionRecord(model);

                const found = await this.archivalDao().getExecutionById("upsert-exec");
                expect(found).toBeDefined();
                expect(found.reason).toBe("updated reason");
                expect(found.state).toBe("FAILED");
            });

            it('testRoundTrip_allFields', async () => {
                const req = { name: "my-wf", version: 3 };
                const model = {
                    executionId: "rt-exec",
                    scheduleName: "rt-sched",
                    workflowName: "my-wf",
                    workflowId: "wf-instance-789",
                    reason: "Timeout exceeded",
                    stackTrace: "java.lang.RuntimeException: Timeout\n\tat Foo.bar(Foo.java:42)",
                    state: "FAILED",
                    scheduledTime: 1000000,
                    executionTime: 1000500,
                    startWorkflowRequest: req
                };

                await this.archivalDao().saveExecutionRecord(model);

                const found = await this.archivalDao().getExecutionById("rt-exec");
                expect(found).toBeDefined();
                expect(found.scheduleName).toBe("rt-sched");
                expect(found.workflowName).toBe("my-wf");
                expect(found.workflowId).toBe("wf-instance-789");
                expect(found.reason).toBe("Timeout exceeded");
                expect(found.stackTrace).toContain("RuntimeException");
                expect(found.state).toBe("FAILED");
                expect(found.scheduledTime).toBe(1000000);
                expect(found.executionTime).toBe(1000500);
                expect(found.startWorkflowRequest).toBeDefined();
                expect(found.startWorkflowRequest.name).toBe("my-wf");
                expect(found.startWorkflowRequest.version).toBe(3);
            });

            it('testSearch_byScheduleName', async () => {
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-a", "e1"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-a", "e2"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-b", "e3"));

                const result = await this.archivalDao().searchScheduledExecutions("sched-a", null, 0, 10, null);
                expect(result.totalHits).toBe(2);
                expect(result.results).toContain("e1");
                expect(result.results).toContain("e2");
            });

            it('testSearch_byWorkflowName', async () => {
                const e1: any = this.buildExecution("wn-sched", "e-wn1");
                e1.workflowName = "payment-processor";
                await this.archivalDao().saveExecutionRecord(e1);

                const e2: any = this.buildExecution("wn-sched", "e-wn2");
                e2.workflowName = "order-fulfillment";
                await this.archivalDao().saveExecutionRecord(e2);

                const result = await this.archivalDao().searchScheduledExecutions("workflowName=payment", null, 0, 10, null);
                expect(result.totalHits).toBe(1);
                expect(result.results[0]).toBe("e-wn1");
            });

            it('testSearch_byExecutionId', async () => {
                await this.archivalDao().saveExecutionRecord(this.buildExecution("eid-sched", "exact-id-123"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("eid-sched", "exact-id-456"));

                const result = await this.archivalDao().searchScheduledExecutions("executionId=exact-id-123", null, 0, 10, null);
                expect(result.totalHits).toBe(1);
                expect(result.results[0]).toBe("exact-id-123");
            });

            it('testSearch_wildcard_returnsAll', async () => {
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-1", "e1"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-2", "e2"));

                const result = await this.archivalDao().searchScheduledExecutions(null, "*", 0, 10, null);
                expect(result.totalHits).toBe(2);
            });

            it('testSearch_pagination', async () => {
                for (let i = 0; i < 5; i++) {
                    const exec: any = this.buildExecution("page-sched", "page-" + Math.random().toString());
                    exec.scheduledTime = Date.now() + i * 1000;
                    await this.archivalDao().saveExecutionRecord(exec);
                }

                const page1 = await this.archivalDao().searchScheduledExecutions("page-sched", null, 0, 2, null);
                expect(page1.totalHits).toBe(5);
                expect(page1.results.length).toBe(2);

                const page2 = await this.archivalDao().searchScheduledExecutions("page-sched", null, 2, 2, null);
                expect(page2.totalHits).toBe(5);
                expect(page2.results.length).toBe(2);
            });

            it('testSearch_noResults_returnsEmpty', async () => {
                const result = await this.archivalDao().searchScheduledExecutions("nonexistent", null, 0, 10, null);
                expect(result.totalHits).toBe(0);
                expect(result.results.length).toBe(0);
            });

            it('testSearch_scheduleNameInSyntax', async () => {
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-x", "e1"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-y", "e2"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("sched-z", "e3"));

                const result = await this.archivalDao().searchScheduledExecutions("scheduleName IN (sched-x,sched-y)", null, 0, 10, null);
                expect(result.totalHits).toBe(2);
                expect(result.results).toContain("e1");
                expect(result.results).toContain("e2");
                expect(result.results).not.toContain("e3");
            });

            it('testSearch_stateInSyntax', async () => {
                const executed: any = this.buildExecution("state-sched", "e-exec");
                executed.state = "EXECUTED";
                await this.archivalDao().saveExecutionRecord(executed);

                const polled: any = this.buildExecution("state-sched", "e-poll");
                polled.state = "POLLED";
                await this.archivalDao().saveExecutionRecord(polled);

                const failed: any = this.buildExecution("state-sched", "e-fail");
                failed.state = "FAILED";
                await this.archivalDao().saveExecutionRecord(failed);

                const result = await this.archivalDao().searchScheduledExecutions("state IN (POLLED,FAILED)", null, 0, 10, null);
                expect(result.totalHits).toBe(2);
                expect(result.results).toContain("e-poll");
                expect(result.results).toContain("e-fail");
                expect(result.results).not.toContain("e-exec");
            });

            it('testSearch_scheduledTimeRange', async () => {
                const early: any = this.buildExecution("time-sched", "e-early");
                early.scheduledTime = 1000;
                await this.archivalDao().saveExecutionRecord(early);

                const mid: any = this.buildExecution("time-sched", "e-mid");
                mid.scheduledTime = 5000;
                await this.archivalDao().saveExecutionRecord(mid);

                const late: any = this.buildExecution("time-sched", "e-late");
                late.scheduledTime = 9000;
                await this.archivalDao().saveExecutionRecord(late);

                const result = await this.archivalDao().searchScheduledExecutions("scheduledTime>2000 AND scheduledTime<8000", null, 0, 10, null);
                expect(result.totalHits).toBe(1);
                expect(result.results[0]).toBe("e-mid");
            });

            it('testSearch_combinedFilters', async () => {
                const e1: any = this.buildExecution("combo-a", "c1");
                e1.state = "EXECUTED";
                e1.scheduledTime = 5000;
                await this.archivalDao().saveExecutionRecord(e1);

                const e2: any = this.buildExecution("combo-a", "c2");
                e2.state = "FAILED";
                e2.scheduledTime = 5000;
                await this.archivalDao().saveExecutionRecord(e2);

                const e3: any = this.buildExecution("combo-b", "c3");
                e3.state = "EXECUTED";
                e3.scheduledTime = 5000;
                await this.archivalDao().saveExecutionRecord(e3);

                const e4: any = this.buildExecution("combo-a", "c4");
                e4.state = "EXECUTED";
                e4.scheduledTime = 1000;
                await this.archivalDao().saveExecutionRecord(e4);

                const query = "scheduleName IN (combo-a) AND state IN (EXECUTED) AND scheduledTime>2000";
                const result = await this.archivalDao().searchScheduledExecutions(query, null, 0, 10, null);
                expect(result.totalHits).toBe(1);
                expect(result.results[0]).toBe("c1");
            });

            it('testSearch_withSort', async () => {
                const older: any = this.buildExecution("sort-sched", "s-old");
                older.scheduledTime = 1000;
                await this.archivalDao().saveExecutionRecord(older);

                const newer: any = this.buildExecution("sort-sched", "s-new");
                newer.scheduledTime = 9000;
                await this.archivalDao().saveExecutionRecord(newer);

                const descResult = await this.archivalDao().searchScheduledExecutions("sort-sched", null, 0, 10, null);
                expect(descResult.results[0]).toBe("s-new");

                const ascResult = await this.archivalDao().searchScheduledExecutions("sort-sched", null, 0, 10, ["scheduledTime:ASC"]);
                expect(ascResult.results[0]).toBe("s-old");
            });

            it('testSearch_emptyQuery_returnsAll', async () => {
                await this.archivalDao().saveExecutionRecord(this.buildExecution("all-a", "a1"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("all-b", "a2"));

                const result = await this.archivalDao().searchScheduledExecutions("", "*", 0, 10, null);
                expect(result.totalHits).toBe(2);
            });

            it('testSearch_nullQuery_returnsAll', async () => {
                await this.archivalDao().saveExecutionRecord(this.buildExecution("null-a", "n1"));
                await this.archivalDao().saveExecutionRecord(this.buildExecution("null-b", "n2"));

                const result = await this.archivalDao().searchScheduledExecutions(null, "*", 0, 10, null);
                expect(result.totalHits).toBe(2);
            });

            it('testCleanupOldRecords', async () => {
                for (let i = 0; i < 10; i++) {
                    const exec: any = this.buildExecution("cleanup-sched", "cleanup-" + i);
                    exec.scheduledTime = 1000000 + i * 1000;
                    await this.archivalDao().saveExecutionRecord(exec);
                }

                await this.archivalDao().cleanupOldRecords(3, 5);

                const result = await this.archivalDao().searchScheduledExecutions("cleanup-sched", null, 0, 20, null);
                expect(result.totalHits).toBe(3);
            });

            it('testCleanupOldRecords_belowThreshold_noOp', async () => {
                for (let i = 0; i < 3; i++) {
                    const exec: any = this.buildExecution("noclean-sched", "noclean-" + i);
                    exec.scheduledTime = 1000000 + i * 1000;
                    await this.archivalDao().saveExecutionRecord(exec);
                }

                await this.archivalDao().cleanupOldRecords(2, 5);

                const result = await this.archivalDao().searchScheduledExecutions("noclean-sched", null, 0, 20, null);
                expect(result.totalHits).toBe(3);
            });

            it('testVolume_manyRecordsSameSchedule', async () => {
                const count = 50;
                for (let i = 0; i < count; i++) {
                    const exec: any = this.buildExecution("volume-sched", "vol-" + i);
                    exec.scheduledTime = 1000000 + i * 1000;
                    await this.archivalDao().saveExecutionRecord(exec);
                }

                const result = await this.archivalDao().searchScheduledExecutions("volume-sched", null, 0, 100, null);
                expect(result.totalHits).toBe(count);
            });
        });
    }
}

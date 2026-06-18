import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulerService } from '../../../../../../../main/typescript/io/orkes/conductor/scheduler/service/SchedulerService';

export abstract class AbstractSchedulerServiceIntegrationTest {
    protected abstract dao(): any;
    protected abstract dataSource(): any;

    protected workflowService: any;
    protected queueDAO: any;
    protected service: any;
    protected timeProvider: any;

    public runTests() {
        describe('AbstractSchedulerServiceIntegrationTest', () => {
            beforeEach(async () => {
                const conn = await this.dataSource().getConnection();
                try {
                    await conn.query("DELETE FROM scheduler_execution");
                    await conn.query("DELETE FROM scheduler");
                    await conn.query("DELETE FROM workflow_scheduled_executions");
                } finally {
                    conn.release();
                }

                this.workflowService = {
                    startWorkflow: vi.fn()
                };
                this.timeProvider = {
                    getUtcTime: vi.fn()
                };
                this.queueDAO = {
                    dummyQueues: new Map(),
                    clearData: vi.fn()
                };

                const props = {
                    archivalThreadCount: 1,
                    pollingThreadCount: 1,
                    pollBatchSize: 10,
                    pollingInterval: 100
                };

                this.service = new SchedulerService(
                    {}, // mock SchedulerArchivalDAO
                    this.dao(),
                    this.workflowService,
                    this.queueDAO,
                    {}, // mock executor
                    null, // optional redis monitor empty
                    props,
                    this.timeProvider,
                    {}, // mock lock
                    {}, // mock object mapper
                    {}  // mock schedule change listener
                );
            });

            const buildSchedule = (name: string, workflowName: string) => {
                return {
                    name,
                    cronExpression: "0 * * * * *",
                    zoneId: "UTC",
                    startWorkflowRequest: { name: workflowName, version: 1 },
                    paused: false
                };
            };

            const utcTime = (epochMillis: number) => {
                return new Date(epochMillis);
            };

            it('testCreateOrUpdate_createTimePreservedOnUpdate', async () => {
                const scheduleName = `create-time-${Math.random()}`;
                const fixedTime = 1630000000000;
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(fixedTime));

                const schedule = buildSchedule(scheduleName, "ct-wf");
                const saved1 = await this.service.createOrUpdateWorkflowSchedule(schedule);
                const createTime1 = saved1.createTime;
                expect(createTime1).toBeGreaterThan(0);

                this.timeProvider.getUtcTime.mockReturnValue(utcTime(fixedTime + 5000));
                await this.service.createOrUpdateWorkflowSchedule(schedule);

                const found = await this.dao().findScheduleByName(scheduleName);
                expect(found).toBeDefined();
                expect(found.createTime).toBe(createTime1);
                expect(found.updatedTime).toBeGreaterThan(createTime1);
            });

            it('testCreateOrUpdate_nextRunTimeStoredAndRetrievable', async () => {
                const scheduleName = `next-run-stored-${Math.random()}`;
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(1630000000000));

                const schedule = buildSchedule(scheduleName, "nrt-wf");
                await this.service.createOrUpdateWorkflowSchedule(schedule);

                const stored = await this.dao().getNextRunTimeInEpoch(scheduleName);
                expect(stored).toBeGreaterThan(0);
            });

            it('testHandleSchedules_createsExecutionRecordAndFiresWorkflow', async () => {
                const scheduleName = `handle-exec-${Math.random()}`;
                const createTime = 1630000000000;
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(createTime));

                const schedule = buildSchedule(scheduleName, "handle-wf");
                await this.service.createOrUpdateWorkflowSchedule(schedule);

                const pastTime = Date.now() - 5000;
                await this.dao().setNextRunTimeInEpoch(scheduleName, pastTime);

                this.timeProvider.getUtcTime.mockReturnValue(utcTime(Date.now()));
                this.workflowService.startWorkflow.mockReturnValue("wf-test-id");

                await this.service.handleSchedules([scheduleName]);

                expect(this.workflowService.startWorkflow).toHaveBeenCalledTimes(1);

                const archivalQueue = this.queueDAO.dummyQueues.get('conductor_system_scheduler_archival');
                expect(archivalQueue).toBeDefined();
                expect(archivalQueue.size).toBeGreaterThan(0);
            });

            it('testHandleSchedules_advancesNextRunPointer', async () => {
                const scheduleName = `pointer-advance-${Math.random()}`;
                const createTime = 1630000000000;
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(createTime));

                const schedule = buildSchedule(scheduleName, "ptr-wf");
                await this.service.createOrUpdateWorkflowSchedule(schedule);

                const pastTime = Date.now() - 5000;
                await this.dao().setNextRunTimeInEpoch(scheduleName, pastTime);

                this.timeProvider.getUtcTime.mockReturnValue(utcTime(Date.now()));
                this.workflowService.startWorkflow.mockReturnValue("wf-id");

                await this.service.handleSchedules([scheduleName]);

                const newNextRun = await this.dao().getNextRunTimeInEpoch(scheduleName);
                expect(newNextRun).toBeGreaterThan(Date.now() - 1000);
            });

            it('testDeleteSchedule_removesScheduleFromDAO', async () => {
                const scheduleName = `delete-test-${Math.random()}`;
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(1630000000000));

                const schedule = buildSchedule(scheduleName, "del-wf");
                await this.service.createOrUpdateWorkflowSchedule(schedule);
                expect(await this.dao().findScheduleByName(scheduleName)).toBeDefined();

                await this.service.deleteSchedule(scheduleName);
                expect(await this.dao().findScheduleByName(scheduleName)).toBeNull();
            });

            it('testPauseAndResumeSchedule', async () => {
                const scheduleName = `pause-resume-${Math.random()}`;
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(1630000000000));

                const schedule = buildSchedule(scheduleName, "pr-wf");
                await this.service.createOrUpdateWorkflowSchedule(schedule);

                let found = await this.dao().findScheduleByName(scheduleName);
                expect(found.paused).toBe(false);

                await this.service.pauseSchedule(scheduleName);
                found = await this.dao().findScheduleByName(scheduleName);
                expect(found.paused).toBe(true);

                await this.service.resumeSchedule(scheduleName);
                found = await this.dao().findScheduleByName(scheduleName);
                expect(found.paused).toBe(false);
            });

            it('testPauseSchedule_throwsOnMissingSchedule', async () => {
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(1630000000000));
                await expect(this.service.pauseSchedule(`nonexistent-schedule-${Math.random()}`)).rejects.toThrow();
            });

            it('testSearchSchedules_returnsMatchingResults', async () => {
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(1630000000000));

                const prefix = `search-${Math.random().toString().substring(2, 10)}-`;
                for (let i = 0; i < 3; i++) {
                    await this.service.createOrUpdateWorkflowSchedule(buildSchedule(prefix + i, "search-wf"));
                }
                await this.service.createOrUpdateWorkflowSchedule(buildSchedule(prefix + "other", "different-wf"));

                const result = await this.service.searchSchedules("search-wf", null, null, null, 0, 10, null);
                expect(result.totalHits).toBeGreaterThanOrEqual(3);

                const allResult = await this.service.searchSchedules(null, null, null, null, 0, 100, null);
                expect(allResult.totalHits).toBeGreaterThanOrEqual(4);
            });

            it('testHandleSchedules_pausedScheduleDoesNotFire', async () => {
                const scheduleName = `paused-no-fire-${Math.random()}`;
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(1630000000000));

                const schedule = buildSchedule(scheduleName, "paused-wf");
                await this.service.createOrUpdateWorkflowSchedule(schedule);

                await this.service.pauseSchedule(scheduleName);

                await this.dao().setNextRunTimeInEpoch(scheduleName, Date.now() - 5000);
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(Date.now()));

                await this.service.handleSchedules([scheduleName]);

                expect(this.workflowService.startWorkflow).not.toHaveBeenCalled();
            });

            it('testHandleSchedules_deletedScheduleIsNoOp', async () => {
                this.timeProvider.getUtcTime.mockReturnValue(utcTime(1630000000000));

                const ghostName = `ghost-${Math.random()}`;
                await this.service.handleSchedules([ghostName]);

                expect(this.workflowService.startWorkflow).not.toHaveBeenCalled();
            });
        });
    }
}

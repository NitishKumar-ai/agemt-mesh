import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulerBulkServiceImpl } from '../../../../../../../main/typescript/io/orkes/conductor/scheduler/service/SchedulerBulkServiceImpl';

describe('SchedulerBulkServiceTest', () => {
    let schedulerService: any;
    let schedulerBulkService: any;

    beforeEach(() => {
        schedulerService = {
            pauseSchedule: vi.fn(),
            resumeSchedule: vi.fn()
        };
        schedulerBulkService = new SchedulerBulkServiceImpl(schedulerService);
    });

    it('pauseSchedules should successfully pause existing schedules', () => {
        const scheduleNames = ['schedule1', 'schedule2'];

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(2);
        expect(response.bulkSuccessfulResults).toContain('schedule1');
        expect(response.bulkSuccessfulResults).toContain('schedule2');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.pauseSchedule).toHaveBeenCalledTimes(2);
        expect(schedulerService.pauseSchedule).toHaveBeenCalledWith('schedule1');
        expect(schedulerService.pauseSchedule).toHaveBeenCalledWith('schedule2');
    });

    it('pauseSchedules should handle exceptions during pause operation', () => {
        const scheduleNames = ['schedule1', 'schedule2'];

        schedulerService.pauseSchedule.mockImplementation((name: string) => {
            if (name === 'schedule2') {
                throw new Error('Database error');
            }
        });

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(1);
        expect(response.bulkSuccessfulResults).toContain('schedule1');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(1);
        expect(response.bulkErrorResults['schedule2']).toBe('Database error');
    });

    it('pauseSchedules should handle empty list', () => {
        const scheduleNames: string[] = [];

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(0);
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.pauseSchedule).not.toHaveBeenCalled();
    });

    it('pauseSchedules should handle single schedule', () => {
        const scheduleNames = ['single_schedule'];

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(1);
        expect(response.bulkSuccessfulResults).toContain('single_schedule');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.pauseSchedule).toHaveBeenCalledTimes(1);
        expect(schedulerService.pauseSchedule).toHaveBeenCalledWith('single_schedule');
    });

    it('pauseSchedules should handle mixed success and failure scenarios', () => {
        const scheduleNames = ['success1', 'exception', 'success2'];

        schedulerService.pauseSchedule.mockImplementation((name: string) => {
            if (name === 'exception') {
                const error = new Error('System error');
                error.name = 'TransientException';
                throw error;
            }
        });

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(2);
        expect(response.bulkSuccessfulResults).toContain('success1');
        expect(response.bulkSuccessfulResults).toContain('success2');

        expect(Object.keys(response.bulkErrorResults)).toHaveLength(1);
        expect(response.bulkErrorResults['exception']).toBe('System error');
    });

    it('pauseSchedules should handle large list within limits', () => {
        const scheduleNames: string[] = [];
        for (let i = 1; i <= 50; i++) {
            scheduleNames.push(`schedule${i}`);
        }

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(50);
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        for (let i = 1; i <= 50; i++) {
            expect(schedulerService.pauseSchedule).toHaveBeenCalledWith(`schedule${i}`);
        }
    });

    it('pauseSchedules should maintain order in results', () => {
        const scheduleNames = ['schedule1', 'schedule2', 'schedule3'];

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(3);
        expect(response.bulkSuccessfulResults).toEqual(scheduleNames);
    });

    it('pauseSchedules should handle non-existent schedule gracefully if no exception thrown', () => {
        const scheduleNames = ['existing_schedule', 'non_existent_schedule'];

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(2);
        expect(response.bulkSuccessfulResults).toContain('existing_schedule');
        expect(response.bulkSuccessfulResults).toContain('non_existent_schedule');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.pauseSchedule).toHaveBeenCalledTimes(2);
        expect(schedulerService.pauseSchedule).toHaveBeenCalledWith('existing_schedule');
        expect(schedulerService.pauseSchedule).toHaveBeenCalledWith('non_existent_schedule');
    });

    it('pauseSchedules should handle ApplicationException with NOT_FOUND code', () => {
        const scheduleNames = ['existing_schedule', 'non_existent_schedule'];

        schedulerService.pauseSchedule.mockImplementation((name: string) => {
            if (name === 'non_existent_schedule') {
                const error = new Error("Schedule 'non_existent_schedule' not found");
                error.name = 'NotFoundException';
                throw error;
            }
        });

        const response = schedulerBulkService.pauseSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(1);
        expect(response.bulkSuccessfulResults).toContain('existing_schedule');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(1);
        expect(response.bulkErrorResults['non_existent_schedule']).toBe("Schedule 'non_existent_schedule' not found");
    });

    // Resume Schedule Tests

    it('resumeSchedules should successfully resume existing schedules', () => {
        const scheduleNames = ['schedule1', 'schedule2'];

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(2);
        expect(response.bulkSuccessfulResults).toContain('schedule1');
        expect(response.bulkSuccessfulResults).toContain('schedule2');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.resumeSchedule).toHaveBeenCalledTimes(2);
        expect(schedulerService.resumeSchedule).toHaveBeenCalledWith('schedule1');
        expect(schedulerService.resumeSchedule).toHaveBeenCalledWith('schedule2');
    });

    it('resumeSchedules should handle exceptions during resume operation', () => {
        const scheduleNames = ['schedule1', 'schedule2'];

        schedulerService.resumeSchedule.mockImplementation((name: string) => {
            if (name === 'schedule2') {
                throw new Error('Database error');
            }
        });

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(1);
        expect(response.bulkSuccessfulResults).toContain('schedule1');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(1);
        expect(response.bulkErrorResults['schedule2']).toBe('Database error');
    });

    it('resumeSchedules should handle empty list', () => {
        const scheduleNames: string[] = [];

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(0);
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.resumeSchedule).not.toHaveBeenCalled();
    });

    it('resumeSchedules should handle single schedule', () => {
        const scheduleNames = ['single_schedule'];

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(1);
        expect(response.bulkSuccessfulResults).toContain('single_schedule');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.resumeSchedule).toHaveBeenCalledTimes(1);
        expect(schedulerService.resumeSchedule).toHaveBeenCalledWith('single_schedule');
    });

    it('resumeSchedules should handle mixed success and failure scenarios', () => {
        const scheduleNames = ['success1', 'exception', 'success2'];

        schedulerService.resumeSchedule.mockImplementation((name: string) => {
            if (name === 'exception') {
                const error = new Error('System error');
                error.name = 'TransientException';
                throw error;
            }
        });

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(2);
        expect(response.bulkSuccessfulResults).toContain('success1');
        expect(response.bulkSuccessfulResults).toContain('success2');

        expect(Object.keys(response.bulkErrorResults)).toHaveLength(1);
        expect(response.bulkErrorResults['exception']).toBe('System error');
    });

    it('resumeSchedules should handle large list within limits', () => {
        const scheduleNames: string[] = [];
        for (let i = 1; i <= 50; i++) {
            scheduleNames.push(`schedule${i}`);
        }

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(50);
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        for (let i = 1; i <= 50; i++) {
            expect(schedulerService.resumeSchedule).toHaveBeenCalledWith(`schedule${i}`);
        }
    });

    it('resumeSchedules should maintain order in results', () => {
        const scheduleNames = ['schedule1', 'schedule2', 'schedule3'];

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(3);
        expect(response.bulkSuccessfulResults).toEqual(scheduleNames);
    });

    it('resumeSchedules should handle non-existent schedule gracefully if no exception thrown', () => {
        const scheduleNames = ['existing_schedule', 'non_existent_schedule'];

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(2);
        expect(response.bulkSuccessfulResults).toContain('existing_schedule');
        expect(response.bulkSuccessfulResults).toContain('non_existent_schedule');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.resumeSchedule).toHaveBeenCalledTimes(2);
        expect(schedulerService.resumeSchedule).toHaveBeenCalledWith('existing_schedule');
        expect(schedulerService.resumeSchedule).toHaveBeenCalledWith('non_existent_schedule');
    });

    it('resumeSchedules should handle ApplicationException with NOT_FOUND code', () => {
        const scheduleNames = ['existing_schedule', 'non_existent_schedule'];

        schedulerService.resumeSchedule.mockImplementation((name: string) => {
            if (name === 'non_existent_schedule') {
                const error = new Error("Schedule 'non_existent_schedule' not found");
                error.name = 'NotFoundException';
                throw error;
            }
        });

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(1);
        expect(response.bulkSuccessfulResults).toContain('existing_schedule');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(1);
        expect(response.bulkErrorResults['non_existent_schedule']).toBe("Schedule 'non_existent_schedule' not found");
    });

    it('resumeSchedules should handle already running schedule gracefully', () => {
        const scheduleNames = ['paused_schedule', 'already_running_schedule'];

        const response = schedulerBulkService.resumeSchedules(scheduleNames);

        expect(response.bulkSuccessfulResults).toHaveLength(2);
        expect(response.bulkSuccessfulResults).toContain('paused_schedule');
        expect(response.bulkSuccessfulResults).toContain('already_running_schedule');
        expect(Object.keys(response.bulkErrorResults)).toHaveLength(0);

        expect(schedulerService.resumeSchedule).toHaveBeenCalledTimes(2);
        expect(schedulerService.resumeSchedule).toHaveBeenCalledWith('paused_schedule');
        expect(schedulerService.resumeSchedule).toHaveBeenCalledWith('already_running_schedule');
    });
});

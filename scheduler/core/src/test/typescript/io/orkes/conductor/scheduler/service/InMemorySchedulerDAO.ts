import { SearchResult } from '../../../../../../../../../mock';

export class InMemorySchedulerDAO {
    private schedules: Map<string, any> = new Map();
    private executionRecords: Map<string, any> = new Map();
    private nextRunTimes: Map<string, number> = new Map();

    public clear(): void {
        this.schedules.clear();
        this.executionRecords.clear();
        this.nextRunTimes.clear();
    }

    public updateSchedule(workflowSchedule: any): void {
        this.schedules.set(workflowSchedule.name, workflowSchedule);
    }

    public saveExecutionRecord(executionModel: any): void {
        this.executionRecords.set(executionModel.executionId, executionModel);
    }

    public readExecutionRecord(executionId: string): any {
        return this.executionRecords.get(executionId);
    }

    public removeExecutionRecord(executionId: string): void {
        this.executionRecords.delete(executionId);
    }

    public findScheduleByName(name: string): any {
        return this.schedules.get(name);
    }

    public findAllSchedules(workflowName: string | null): any[] {
        return Array.from(this.schedules.values())
            .filter(s => workflowName == null || workflowName === s.startWorkflowRequest?.name);
    }

    public deleteWorkflowSchedule(name: string): void {
        this.schedules.delete(name);
    }

    public getPendingExecutionRecordIds(): string[] {
        return Array.from(this.executionRecords.values()).map(r => r.executionId);
    }

    public getAllSchedules(): any[] {
        return Array.from(this.schedules.values());
    }

    public findAllByNames(workflowScheduleNames: Set<string>): Map<string, any> {
        const result = new Map<string, any>();
        for (const name of workflowScheduleNames) {
            const s = this.schedules.get(name);
            if (s !== undefined) {
                result.set(name, s);
            }
        }
        return result;
    }

    public getNextRunTimeInEpoch(scheduleName: string): number {
        return this.nextRunTimes.get(scheduleName) ?? -1;
    }

    public setNextRunTimeInEpoch(name: string, toEpochMilli: number): void {
        this.nextRunTimes.set(name, toEpochMilli);
    }

    public searchSchedules(
        workflowName: string | null,
        scheduleName: string | null,
        paused: boolean | null,
        freeText: string | null,
        start: number,
        size: number,
        sortOptions: string[] | null
    ): any {
        let filtered = Array.from(this.schedules.values())
            .filter(s => workflowName == null || workflowName === s.startWorkflowRequest?.name)
            .filter(s => scheduleName == null || s.name.includes(scheduleName))
            .filter(s => paused == null || s.paused === paused);

        if (sortOptions && sortOptions.length > 0) {
            const sortOption = sortOptions[0];
            const parts = sortOption.split(':');
            const field = parts[0];
            const asc = parts.length < 2 || parts[1].toUpperCase() === 'ASC';
            if (field === 'name') {
                filtered.sort((a, b) => {
                    const cmp = a.name.localeCompare(b.name);
                    return asc ? cmp : -cmp;
                });
            }
        }

        const total = filtered.length;
        const end = Math.min(start + size, total);
        const page = start < total ? filtered.slice(start, end) : [];
        return { totalHits: total, results: page };
    }
}

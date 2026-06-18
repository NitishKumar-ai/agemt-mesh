export class SchedulerSearchQuery {
    private readonly scheduleNames: Array<string>;
    private readonly states: Array<string>;
    private readonly scheduledTimeAfter: number | null;
    private readonly scheduledTimeBefore: number | null;
    private readonly workflowName: string | null;
    private readonly executionId: string | null;
    private readonly rawQuery: string | null;

    private constructor(
        scheduleNames: Array<string>,
        states: Array<string>,
        scheduledTimeAfter: number | null,
        scheduledTimeBefore: number | null,
        workflowName: string | null,
        executionId: string | null,
        rawQuery: string | null
    ) {
        this.scheduleNames = scheduleNames;
        this.states = states;
        this.scheduledTimeAfter = scheduledTimeAfter;
        this.scheduledTimeBefore = scheduledTimeBefore;
        this.workflowName = workflowName;
        this.executionId = executionId;
        this.rawQuery = rawQuery;
    }

    public static parse(query: string | null): SchedulerSearchQuery {
        const scheduleNames: Array<string> = [];
        const states: Array<string> = [];
        let scheduledTimeAfter: number | null = null;
        let scheduledTimeBefore: number | null = null;
        let workflowName: string | null = null;
        let executionId: string | null = null;

        if (query == null || query.trim().length === 0) {
            return new SchedulerSearchQuery(scheduleNames, states, null, null, null, null, query);
        }

        const clauses = query.split(/\s+AND\s+/);
        for (let clause of clauses) {
            clause = clause.trim();
            if (clause.length === 0) {
                continue;
            }

            if (clause.startsWith("scheduleName IN (") && clause.endsWith(")")) {
                const csv = clause.substring("scheduleName IN (".length, clause.length - 1);
                for (const v of csv.split(",")) {
                    const trimmed = v.trim();
                    if (trimmed.length > 0) {
                        scheduleNames.push(trimmed);
                    }
                }
            } else if (clause.startsWith("state IN (") && clause.endsWith(")")) {
                const csv = clause.substring("state IN (".length, clause.length - 1);
                for (const v of csv.split(",")) {
                    const trimmed = v.trim();
                    if (trimmed.length > 0) {
                        states.push(trimmed);
                    }
                }
            } else if (clause.startsWith("scheduledTime>")) {
                const val = clause.substring("scheduledTime>".length).trim();
                scheduledTimeAfter = parseInt(val, 10);
            } else if (clause.startsWith("scheduledTime<")) {
                const val = clause.substring("scheduledTime<".length).trim();
                scheduledTimeBefore = parseInt(val, 10);
            } else if (clause.startsWith("workflowName=")) {
                workflowName = clause.substring("workflowName=".length).trim();
            } else if (clause.startsWith("executionId=")) {
                executionId = clause.substring("executionId=".length).trim();
            } else {
                // Treat unrecognized clause as a literal schedule name
                scheduleNames.push(clause);
            }
        }

        return new SchedulerSearchQuery(
            scheduleNames,
            states,
            scheduledTimeAfter,
            scheduledTimeBefore,
            workflowName,
            executionId,
            query
        );
    }

    public getScheduleNames(): Array<string> {
        return this.scheduleNames;
    }

    public getStates(): Array<string> {
        return this.states;
    }

    public getScheduledTimeAfter(): number | null {
        return this.scheduledTimeAfter;
    }

    public getScheduledTimeBefore(): number | null {
        return this.scheduledTimeBefore;
    }

    public getWorkflowName(): string | null {
        return this.workflowName;
    }

    public getExecutionId(): string | null {
        return this.executionId;
    }

    public hasScheduleNames(): boolean {
        return this.scheduleNames.length > 0;
    }

    public hasStates(): boolean {
        return this.states.length > 0;
    }

    public hasTimeFilter(): boolean {
        return this.scheduledTimeAfter !== null || this.scheduledTimeBefore !== null;
    }

    public hasWorkflowName(): boolean {
        return this.workflowName !== null && this.workflowName.length > 0;
    }

    public hasExecutionId(): boolean {
        return this.executionId !== null && this.executionId.length > 0;
    }

    public isEmpty(): boolean {
        return !this.hasScheduleNames()
                && !this.hasStates()
                && !this.hasTimeFilter()
                && !this.hasWorkflowName()
                && !this.hasExecutionId();
    }

    private static readonly SORT_COLUMN_MAP: Map<string, string> = new Map([
        ["scheduledTime", "scheduled_time"],
        ["executionTime", "execution_time"],
        ["scheduleName", "schedule_name"],
        ["workflowName", "workflow_name"],
        ["state", "state"]
    ]);

    public static resolveColumnName(uiFieldName: string): string {
        return SchedulerSearchQuery.SORT_COLUMN_MAP.get(uiFieldName) ?? "scheduled_time";
    }
}

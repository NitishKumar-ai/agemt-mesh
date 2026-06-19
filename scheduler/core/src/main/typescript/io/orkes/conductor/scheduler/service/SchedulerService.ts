import { SearchResult } from 'com/netflix/conductor/common/run/SearchResult';
import { SchedulerArchivalDAO } from 'io/orkes/conductor/dao/archive/SchedulerArchivalDAO';
import { SchedulerDAO } from 'io/orkes/conductor/dao/scheduler/SchedulerDAO';
import { ScheduleChangeListener } from 'io/orkes/conductor/scheduler/listener/ScheduleChangeListener';
import { SchedulerServiceExecutor } from 'io/orkes/conductor/scheduler/service/SchedulerServiceExecutor';
import { WorkflowSchedule } from 'io/orkes/conductor/scheduler/model/WorkflowSchedule';
import { WorkflowScheduleModel } from 'io/orkes/conductor/scheduler/model/WorkflowScheduleModel';
import { WorkflowScheduleExecutionModel } from 'io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';
import { NextScheduleResult } from 'io/orkes/conductor/scheduler/model/NextScheduleResult';

export class SchedulerService {
    public static readonly LOCK_CLEANUP_KEY = "SCHEDULER_ARCHIVAL_RECORDS_CLEANUP";
    public static readonly CONDUCTOR_SYSTEM_SCHEDULER_QUEUE_NAME = "conductor_system_scheduler";
    public static readonly CONDUCTOR_SYSTEM_SCHEDULER_ARCHIVAL_QUEUE_NAME = "conductor_system_scheduler_archival";

    public readonly zoneId: string;
    
    private readonly schedulerArchivalDAO: SchedulerArchivalDAO;
    protected readonly schedulerDAO: SchedulerDAO;
    private readonly workflowService: any;
    protected readonly queueDAO: any;
    private readonly redisMaintenanceDAO: any;
    protected readonly properties: any;
    private readonly schedulerTimeProvider: any;
    private readonly objectMapper: any;
    private readonly scheduleChangeListener: ScheduleChangeListener;

    protected scheduleWfPollerBackoff: number = 0;
    protected pauseSchedulerFlag: boolean = false;
    protected backoffFactor: number = 0;
    protected archivalsSinceLastIndex: number = 0;

    constructor(
        schedulerArchivalDAO: SchedulerArchivalDAO,
        schedulerDAO: SchedulerDAO,
        workflowService: any,
        queueDAO: any,
        schedulerServiceExecutor: SchedulerServiceExecutor,
        redisMaintenanceDAO: any,
        properties: any,
        schedulerTimeProvider: any,
        lock: any,
        objectMapper: any,
        scheduleChangeListener: ScheduleChangeListener
    ) {
        this.schedulerArchivalDAO = schedulerArchivalDAO;
        this.schedulerDAO = schedulerDAO;
        this.workflowService = workflowService;
        this.queueDAO = queueDAO;
        this.redisMaintenanceDAO = redisMaintenanceDAO;
        this.properties = properties;
        this.zoneId = properties.getSchedulerTimeZone();
        this.schedulerTimeProvider = schedulerTimeProvider;
        this.objectMapper = objectMapper;
        this.scheduleChangeListener = scheduleChangeListener;
    }

    protected setRequestOrgId(orgId: string): void {}

    protected clearRequestOrgId(): void {}

    protected getCurrentUserId(): string {
        return "";
    }

    protected checkExecutionPermission(schedule: WorkflowScheduleModel): void {}

    protected checkScheduleLimit(workflowSchedule: WorkflowSchedule): void {}

    protected handlePermissionViolation(e: any): void {}

    protected doSearchSchedules(
        workflowName: string,
        scheduleName: string,
        paused: boolean,
        freeText: string,
        start: number,
        size: number,
        sortOptions: Array<string>
    ): SearchResult<WorkflowScheduleModel> {
        return this.schedulerDAO.searchSchedules(
            workflowName, scheduleName, paused, freeText, start, size, sortOptions
        );
    }

    public createOrUpdateWorkflowSchedule(workflowSchedule: WorkflowSchedule): WorkflowScheduleModel {
        this.checkScheduleLimit(workflowSchedule);
        
        let existingSchedule = this.schedulerDAO.findScheduleByName(workflowSchedule.getName());
        let updateModel = workflowSchedule as WorkflowScheduleModel;
        
        if (existingSchedule != null) {
            updateModel.setCreateTime(existingSchedule.getCreateTime());
            updateModel.setCreatedBy(existingSchedule.getCreatedBy());
        } else {
            updateModel.setCreateTime(Date.now());
            updateModel.setCreatedBy(this.getCurrentUserId());
        }
        
        updateModel.setUpdatedBy(this.getCurrentUserId());
        updateModel.setUpdatedTime(Date.now());
        
        this.schedulerDAO.updateSchedule(updateModel);
        
        if (existingSchedule == null && this.scheduleChangeListener.onScheduleRegistered) {
            this.scheduleChangeListener.onScheduleRegistered(updateModel);
        } else if (existingSchedule != null && this.scheduleChangeListener.onScheduleUpdated) {
            this.scheduleChangeListener.onScheduleUpdated(updateModel);
        }
        
        return updateModel;
    }

    public getSchedule(name: string): WorkflowScheduleModel | null {
        return this.schedulerDAO.findScheduleByName(name);
    }

    public getAllSchedulesForWorkflow(workflowName: string): Array<WorkflowScheduleModel> {
        return this.schedulerDAO.findAllSchedules(workflowName);
    }

    public getAllSchedules(): Array<WorkflowScheduleModel> {
        return this.schedulerDAO.getAllSchedules();
    }

    public deleteSchedule(name: string): void {
        let wsm = this.schedulerDAO.findScheduleByName(name);
        if (wsm == null) {
            return;
        }
        this.schedulerDAO.deleteWorkflowSchedule(wsm.getName());
        if (this.scheduleChangeListener.onScheduleDeleted) {
            this.scheduleChangeListener.onScheduleDeleted(wsm.getName());
        }
    }

    public pauseSchedule(name: string, pausedReason?: string): void {
        let userId = this.getCurrentUserId();
        let wsm = this.schedulerDAO.findScheduleByName(name);
        if (wsm == null) {
            throw new Error(`Schedule '${name}' not found`);
        }
        wsm.setPaused(true);
        wsm.setUpdatedBy(userId);
        wsm.setUpdatedTime(Date.now());
        if (pausedReason) {
            wsm.setPausedReason(pausedReason);
        }
        this.schedulerDAO.updateSchedule(wsm);
        if (this.scheduleChangeListener.onSchedulePaused) {
            this.scheduleChangeListener.onSchedulePaused(wsm);
        }
    }

    public resumeSchedule(name: string): void {
        let wsm = this.schedulerDAO.findScheduleByName(name);
        if (wsm == null || !wsm.isPaused()) {
            throw new Error(`Schedule '${name}' not found`);
        }
        wsm.setPaused(false);
        wsm.setPausedReason(null);
        this.createOrUpdateWorkflowSchedule(wsm);
    }

    public pauseScheduler(pause: boolean): void {
        this.pauseSchedulerFlag = pause;
    }

    public doStop(): void {
        // Shutdown logic
    }
}

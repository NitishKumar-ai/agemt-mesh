package io.orkes.conductor.dao.scheduler;

import io.orkes.conductor.scheduler.model.WorkflowScheduleModel;

/**
 * No-op implementation of {@link SchedulerCacheDAO} that always reports a cache miss. Used as the
 * default when no external cache (e.g. Redis) is configured.
 */
public class NoOpSchedulerCacheDAO implements SchedulerCacheDAO {

    @Override
    public void updateSchedule(WorkflowScheduleModel workflowSchedule) {}

    @Override
    public WorkflowScheduleModel findScheduleByName(String name) {
        return null;
    }

    @Override
    public boolean exists(String name) {
        return false;
    }

    @Override
    public void deleteWorkflowSchedule(String name) {}

    @Override
    public long getNextRunTimeInEpoch(String scheduleName) {
        return -1L;
    }

    @Override
    public void setNextRunTimeInEpoch(String scheduleName, long epochMilli) {}
}

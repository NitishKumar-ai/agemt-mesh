package io.orkes.conductor.dao.scheduler;

import io.orkes.conductor.scheduler.model.WorkflowScheduleModel;

public interface SchedulerCacheDAO {

    void updateSchedule(WorkflowScheduleModel workflowSchedule);

    WorkflowScheduleModel findScheduleByName(String name);

    boolean exists(String name);

    void deleteWorkflowSchedule(String name);

    long getNextRunTimeInEpoch(String scheduleName);

    void setNextRunTimeInEpoch(String scheduleName, long epochMilli);
}

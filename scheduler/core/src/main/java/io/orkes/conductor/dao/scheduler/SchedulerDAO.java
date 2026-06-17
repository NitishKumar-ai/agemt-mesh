package io.orkes.conductor.dao.scheduler;

import java.util.List;
import java.util.Map;
import java.util.Set;

import com.netflix.conductor.common.run.SearchResult;

import io.orkes.conductor.scheduler.model.WorkflowScheduleExecutionModel;
import io.orkes.conductor.scheduler.model.WorkflowScheduleModel;

public interface SchedulerDAO {

    void updateSchedule(WorkflowScheduleModel workflowSchedule);

    void saveExecutionRecord(WorkflowScheduleExecutionModel executionModel);

    WorkflowScheduleExecutionModel readExecutionRecord(String executionId);

    void removeExecutionRecord(String executionId);

    WorkflowScheduleModel findScheduleByName(String name);

    List<WorkflowScheduleModel> findAllSchedules(String workflowName);

    void deleteWorkflowSchedule(String name);

    List<String> getPendingExecutionRecordIds();

    List<WorkflowScheduleModel> getAllSchedules();

    Map<String, WorkflowScheduleModel> findAllByNames(Set<String> workflowScheduleNames);

    long getNextRunTimeInEpoch(String scheduleName);

    void setNextRunTimeInEpoch(String name, long toEpochMilli);

    SearchResult<WorkflowScheduleModel> searchSchedules(
            String workflowName,
            String scheduleName,
            Boolean paused,
            String freeText,
            int start,
            int size,
            List<String> sortOptions);
}

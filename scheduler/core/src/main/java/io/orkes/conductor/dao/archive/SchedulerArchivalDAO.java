package io.orkes.conductor.dao.archive;

import java.util.List;
import java.util.Map;
import java.util.Set;

import com.netflix.conductor.common.run.SearchResult;

import io.orkes.conductor.scheduler.model.WorkflowScheduleExecutionModel;

public interface SchedulerArchivalDAO {
    void saveExecutionRecord(WorkflowScheduleExecutionModel executionModel);

    SearchResult<String> searchScheduledExecutions(
            String query, String freeText, int start, int count, List<String> sort);

    Map<String, WorkflowScheduleExecutionModel> getExecutionsByIds(Set<String> executionIds);

    WorkflowScheduleExecutionModel getExecutionById(String executionId);

    void cleanupOldRecords(int archivalMaxRecords, int archivalMaxRecordThreshold);
}

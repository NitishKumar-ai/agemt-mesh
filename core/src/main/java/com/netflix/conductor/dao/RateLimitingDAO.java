package com.netflix.conductor.dao;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.model.TaskModel;

/** An abstraction to enable different Rate Limiting implementations */
public interface RateLimitingDAO {

    /**
     * Checks if the Task is rate limited or not based on the {@link
     * TaskModel#getRateLimitPerFrequency()} and {@link TaskModel#getRateLimitFrequencyInSeconds()}
     *
     * @param task: which needs to be evaluated whether it is rateLimited or not
     * @return true: If the {@link TaskModel} is rateLimited false: If the {@link TaskModel} is not
     *     rateLimited
     */
    boolean exceedsRateLimitPerFrequency(TaskModel task, TaskDef taskDef);
}

package com.netflix.conductor.dao;

import java.util.List;

import com.netflix.conductor.common.metadata.tasks.PollData;

/** An abstraction to enable different PollData store implementations */
public interface PollDataDAO {

    /**
     * Updates the {@link PollData} information with the most recently polled data for a task queue.
     *
     * @param taskDefName name of the task as specified in the task definition
     * @param domain domain in which this task is being polled from
     * @param workerId the identifier of the worker polling for this task
     */
    void updateLastPollData(String taskDefName, String domain, String workerId);

    /**
     * Retrieve the {@link PollData} for the given task in the given domain.
     *
     * @param taskDefName name of the task as specified in the task definition
     * @param domain domain for which {@link PollData} is being requested
     * @return the {@link PollData} for the given task queue in the specified domain
     */
    PollData getPollData(String taskDefName, String domain);

    /**
     * Retrieve the {@link PollData} for the given task across all domains.
     *
     * @param taskDefName name of the task as specified in the task definition
     * @return the {@link PollData} for the given task queue in all domains
     */
    List<PollData> getPollData(String taskDefName);

    /**
     * Retrieve the {@link PollData} for all task types
     *
     * @return the {@link PollData} for all task types
     */
    default List<PollData> getAllPollData() {
        throw new UnsupportedOperationException(
                "The selected PollDataDAO ("
                        + this.getClass().getSimpleName()
                        + ") does not implement the getAllPollData() method");
    }
}

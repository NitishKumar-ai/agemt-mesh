package com.netflix.conductor.cassandra.dao;

import java.util.List;

import com.netflix.conductor.common.metadata.tasks.PollData;
import com.netflix.conductor.dao.PollDataDAO;

/**
 * This is a dummy implementation and this feature is not implemented for Cassandra backed
 * Conductor.
 */
public class CassandraPollDataDAO implements PollDataDAO {

    @Override
    public void updateLastPollData(String taskDefName, String domain, String workerId) {
        throw new UnsupportedOperationException(
                "This method is not implemented in CassandraPollDataDAO. Please use ExecutionDAOFacade instead.");
    }

    @Override
    public PollData getPollData(String taskDefName, String domain) {
        throw new UnsupportedOperationException(
                "This method is not implemented in CassandraPollDataDAO. Please use ExecutionDAOFacade instead.");
    }

    @Override
    public List<PollData> getPollData(String taskDefName) {
        throw new UnsupportedOperationException(
                "This method is not implemented in CassandraPollDataDAO. Please use ExecutionDAOFacade instead.");
    }
}

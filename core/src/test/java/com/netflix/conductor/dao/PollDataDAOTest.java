package com.netflix.conductor.dao;

import java.util.List;

import org.junit.Test;

import com.netflix.conductor.common.metadata.tasks.PollData;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public abstract class PollDataDAOTest {

    protected abstract PollDataDAO getPollDataDAO();

    @Test
    public void testPollData() {
        getPollDataDAO().updateLastPollData("taskDef", null, "workerId1");
        PollData pollData = getPollDataDAO().getPollData("taskDef", null);
        assertNotNull(pollData);
        assertTrue(pollData.getLastPollTime() > 0);
        assertEquals(pollData.getQueueName(), "taskDef");
        assertNull(pollData.getDomain());
        assertEquals(pollData.getWorkerId(), "workerId1");

        getPollDataDAO().updateLastPollData("taskDef", "domain1", "workerId1");
        pollData = getPollDataDAO().getPollData("taskDef", "domain1");
        assertNotNull(pollData);
        assertTrue(pollData.getLastPollTime() > 0);
        assertEquals(pollData.getQueueName(), "taskDef");
        assertEquals(pollData.getDomain(), "domain1");
        assertEquals(pollData.getWorkerId(), "workerId1");

        List<PollData> pData = getPollDataDAO().getPollData("taskDef");
        assertEquals(pData.size(), 2);

        pollData = getPollDataDAO().getPollData("taskDef", "domain2");
        assertNull(pollData);
    }
}

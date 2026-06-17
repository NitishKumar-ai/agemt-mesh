package com.netflix.conductor.common.run;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit4.SpringRunner;

import com.netflix.conductor.common.config.TestObjectMapperConfiguration;
import com.netflix.conductor.common.metadata.tasks.Task;

import com.fasterxml.jackson.databind.ObjectMapper;

import static org.junit.Assert.assertNotNull;

@ContextConfiguration(classes = {TestObjectMapperConfiguration.class})
@RunWith(SpringRunner.class)
public class TaskSummaryTest {

    @Autowired private ObjectMapper objectMapper;

    @Test
    public void testJsonSerializing() throws Exception {
        Task task = new Task();
        TaskSummary taskSummary = new TaskSummary(task);

        String json = objectMapper.writeValueAsString(taskSummary);
        TaskSummary read = objectMapper.readValue(json, TaskSummary.class);
        assertNotNull(read);
    }
}

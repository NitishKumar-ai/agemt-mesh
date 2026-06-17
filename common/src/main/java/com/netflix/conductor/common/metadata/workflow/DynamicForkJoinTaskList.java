package com.netflix.conductor.common.metadata.workflow;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

@ProtoMessage
public class DynamicForkJoinTaskList {

    @ProtoField(id = 1)
    private List<DynamicForkJoinTask> dynamicTasks = new ArrayList<>();

    public void add(
            String taskName, String workflowName, String referenceName, Map<String, Object> input) {
        dynamicTasks.add(new DynamicForkJoinTask(taskName, workflowName, referenceName, input));
    }

    public void add(DynamicForkJoinTask dtask) {
        dynamicTasks.add(dtask);
    }

    public List<DynamicForkJoinTask> getDynamicTasks() {
        return dynamicTasks;
    }

    public void setDynamicTasks(List<DynamicForkJoinTask> dynamicTasks) {
        this.dynamicTasks = dynamicTasks;
    }
}

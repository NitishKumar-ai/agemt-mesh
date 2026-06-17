package com.netflix.conductor.core.execution.evaluators;

import java.util.ArrayList;
import java.util.List;

import com.netflix.conductor.common.metadata.tasks.TaskExecLog;

public class ConsoleBridge {
    private final List<TaskExecLog> logEntries = new ArrayList<>();

    private final String taskId;

    public ConsoleBridge(String taskId) {
        this.taskId = taskId;
    }

    public void error(Object message) {
        log("[Error]", message);
    }

    public void info(Object message) {
        log("[Info]", message);
    }

    public void log(Object message) {
        log("[Log]", message);
    }

    private void log(String level, Object message) {
        String logEntry = String.format("%s \"%s\"", level, message);
        var entry = new TaskExecLog(logEntry);
        entry.setTaskId(taskId);
        logEntries.add(entry);
    }

    public List<TaskExecLog> logs() {
        return logEntries;
    }
}

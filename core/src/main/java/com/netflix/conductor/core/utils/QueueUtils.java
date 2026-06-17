package com.netflix.conductor.core.utils;

import org.apache.commons.lang3.StringUtils;

import com.netflix.conductor.common.metadata.tasks.Task;
import com.netflix.conductor.model.TaskModel;

public class QueueUtils {

    public static final String DOMAIN_SEPARATOR = ":";
    private static final String ISOLATION_SEPARATOR = "-";
    private static final String EXECUTION_NAME_SPACE_SEPARATOR = "@";

    public static String getQueueName(TaskModel taskModel) {
        return getQueueName(
                taskModel.getTaskType(),
                taskModel.getDomain(),
                taskModel.getIsolationGroupId(),
                taskModel.getExecutionNameSpace());
    }

    public static String getQueueName(Task task) {
        return getQueueName(
                task.getTaskType(),
                task.getDomain(),
                task.getIsolationGroupId(),
                task.getExecutionNameSpace());
    }

    /**
     * Creates a queue name string using <code>taskType</code>, <code>domain</code>, <code>
     * isolationGroupId</code> and <code>executionNamespace</code>.
     *
     * @return domain:taskType@eexecutionNameSpace-isolationGroupId.
     */
    public static String getQueueName(
            String taskType, String domain, String isolationGroupId, String executionNamespace) {

        String queueName;
        if (domain == null) {
            queueName = taskType;
        } else {
            queueName = domain + DOMAIN_SEPARATOR + taskType;
        }

        if (executionNamespace != null) {
            queueName = queueName + EXECUTION_NAME_SPACE_SEPARATOR + executionNamespace;
        }

        if (isolationGroupId != null) {
            queueName = queueName + ISOLATION_SEPARATOR + isolationGroupId;
        }
        return queueName;
    }

    public static String getQueueNameWithoutDomain(String queueName) {
        return queueName.substring(queueName.indexOf(DOMAIN_SEPARATOR) + 1);
    }

    public static String getExecutionNameSpace(String queueName) {
        if (StringUtils.contains(queueName, ISOLATION_SEPARATOR)
                && StringUtils.contains(queueName, EXECUTION_NAME_SPACE_SEPARATOR)) {
            return StringUtils.substringBetween(
                    queueName, EXECUTION_NAME_SPACE_SEPARATOR, ISOLATION_SEPARATOR);
        } else if (StringUtils.contains(queueName, EXECUTION_NAME_SPACE_SEPARATOR)) {
            return StringUtils.substringAfter(queueName, EXECUTION_NAME_SPACE_SEPARATOR);
        } else {
            return StringUtils.EMPTY;
        }
    }

    public static boolean isIsolatedQueue(String queue) {
        return StringUtils.isNotBlank(getIsolationGroup(queue));
    }

    private static String getIsolationGroup(String queue) {
        return StringUtils.substringAfter(queue, QueueUtils.ISOLATION_SEPARATOR);
    }

    public static String getTaskType(String queue) {

        if (StringUtils.isBlank(queue)) {
            return StringUtils.EMPTY;
        }

        int domainSeperatorIndex = StringUtils.indexOf(queue, DOMAIN_SEPARATOR);
        int startIndex;
        if (domainSeperatorIndex == -1) {
            startIndex = 0;
        } else {
            startIndex = domainSeperatorIndex + 1;
        }
        int endIndex = StringUtils.indexOf(queue, EXECUTION_NAME_SPACE_SEPARATOR);

        if (endIndex == -1) {
            endIndex = StringUtils.lastIndexOf(queue, ISOLATION_SEPARATOR);
        }
        if (endIndex == -1) {
            endIndex = queue.length();
        }

        return StringUtils.substring(queue, startIndex, endIndex);
    }
}

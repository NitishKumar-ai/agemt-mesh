package com.netflix.conductor.common.metadata.workflow;

public enum IdempotencyStrategy {
    FAIL,
    RETURN_EXISTING,
    FAIL_ON_RUNNING
}

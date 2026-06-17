package io.orkes.conductor.scheduler.service;

import lombok.Getter;

@Getter
public class SchedulerException extends RuntimeException {

    private final String scheduleName;

    public SchedulerException(String message, String scheduleName) {
        super(message);
        this.scheduleName = scheduleName;
    }
}

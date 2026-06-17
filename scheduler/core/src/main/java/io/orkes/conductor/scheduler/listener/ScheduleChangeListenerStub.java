package io.orkes.conductor.scheduler.listener;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.orkes.conductor.scheduler.model.WorkflowSchedule;

/** Stub listener default implementation. Logs each schedule change at debug level. */
public class ScheduleChangeListenerStub implements ScheduleChangeListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(ScheduleChangeListenerStub.class);

    @Override
    public void onScheduleRegistered(WorkflowSchedule schedule) {
        LOGGER.debug("Schedule {} registered", schedule.getName());
    }

    @Override
    public void onScheduleUpdated(WorkflowSchedule schedule) {
        LOGGER.debug("Schedule {} updated", schedule.getName());
    }

    @Override
    public void onScheduleDeleted(String name) {
        LOGGER.debug("Schedule {} deleted", name);
    }

    @Override
    public void onSchedulePaused(WorkflowSchedule schedule) {
        LOGGER.debug("Schedule {} paused", schedule.getName());
    }

    @Override
    public void onScheduleResumed(WorkflowSchedule schedule) {
        LOGGER.debug("Schedule {} resumed", schedule.getName());
    }
}

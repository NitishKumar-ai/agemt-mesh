package io.orkes.conductor.scheduler.listener;

import io.orkes.conductor.scheduler.model.WorkflowSchedule;

/** Listener for changes to workflow schedule registrations. */
public interface ScheduleChangeListener {

    default void onScheduleRegistered(WorkflowSchedule schedule) {}

    default void onScheduleUpdated(WorkflowSchedule schedule) {}

    default void onScheduleDeleted(String name) {}

    default void onSchedulePaused(WorkflowSchedule schedule) {}

    default void onScheduleResumed(WorkflowSchedule schedule) {}
}

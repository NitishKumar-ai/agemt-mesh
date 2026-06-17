package com.netflix.conductor.service;

import java.util.List;

import org.springframework.validation.annotation.Validated;

import com.netflix.conductor.common.metadata.events.EventHandler;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

@Validated
public interface EventService {

    /**
     * Add a new event handler.
     *
     * @param eventHandler Instance of {@link EventHandler}
     */
    void addEventHandler(
            @NotNull(message = "EventHandler cannot be null.") @Valid EventHandler eventHandler);

    /**
     * Update an existing event handler.
     *
     * @param eventHandler Instance of {@link EventHandler}
     */
    void updateEventHandler(
            @NotNull(message = "EventHandler cannot be null.") @Valid EventHandler eventHandler);

    /**
     * Remove an event handler.
     *
     * @param name Event name
     */
    void removeEventHandlerStatus(
            @NotEmpty(message = "EventHandler name cannot be null or empty.") String name);

    /**
     * Get all the event handlers.
     *
     * @return list of {@link EventHandler}
     */
    List<EventHandler> getEventHandlers();

    /**
     * Get event handlers for a given event.
     *
     * @param event Event Name
     * @param activeOnly `true|false` for active only events
     * @return list of {@link EventHandler}
     */
    List<EventHandler> getEventHandlersForEvent(
            @NotEmpty(message = "Event cannot be null or empty.") String event, boolean activeOnly);
}

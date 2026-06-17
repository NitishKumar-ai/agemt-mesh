package io.orkes.conductor.scheduler.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.springframework.stereotype.Service;

@Service
public class SchedulerTimeProvider {

    public ZonedDateTime getUtcTime(ZoneId zoneId) {
        return Instant.now().atZone(zoneId);
    }
}

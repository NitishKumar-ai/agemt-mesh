package io.orkes.conductor.scheduler.model;

import java.time.ZonedDateTime;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class NextScheduleResult {

    private final ZonedDateTime nextRunTime;

    private final String zoneId;

    public static NextScheduleResult of(ZonedDateTime nextRunTime, String zoneId) {
        return new NextScheduleResult(nextRunTime, zoneId);
    }

    public boolean hasNextRunTime() {
        return nextRunTime != null;
    }
}

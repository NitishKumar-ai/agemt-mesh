package com.netflix.conductor.core.utils;

import java.text.ParseException;
import java.time.Duration;
import java.util.Date;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.lang3.time.DateUtils;

public class DateTimeUtils {

    private static final String[] DATE_PATTERNS =
            new String[] {"yyyy-MM-dd HH:mm", "yyyy-MM-dd HH:mm z", "yyyy-MM-dd"};
    private static final Pattern DURATION_PATTERN =
            Pattern.compile(
                    """
                    \\s*(?:(\\d+)\\s*(?:days?|d))?\
                    \\s*(?:(\\d+)\\s*(?:hours?|hrs?|h))?\
                    \\s*(?:(\\d+)\\s*(?:minutes?|mins?|m))?\
                    \\s*(?:(\\d+)\\s*(?:seconds?|secs?|s))?\
                    \\s*""",
                    Pattern.CASE_INSENSITIVE);

    public static Duration parseDuration(String text) {
        Matcher m = DURATION_PATTERN.matcher(text);
        if (!m.matches()) throw new IllegalArgumentException("Not valid duration: " + text);

        int days = (m.start(1) == -1 ? 0 : Integer.parseInt(m.group(1)));
        int hours = (m.start(2) == -1 ? 0 : Integer.parseInt(m.group(2)));
        int mins = (m.start(3) == -1 ? 0 : Integer.parseInt(m.group(3)));
        int secs = (m.start(4) == -1 ? 0 : Integer.parseInt(m.group(4)));
        return Duration.ofSeconds((days * 86400) + (hours * 60L + mins) * 60L + secs);
    }

    public static Date parseDate(String date) throws ParseException {
        return DateUtils.parseDate(date, DATE_PATTERNS);
    }
}

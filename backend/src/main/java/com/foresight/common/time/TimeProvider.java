package com.foresight.common.time;

import com.foresight.common.config.AppProperties;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Single source of "now" and "today" so that time-dependent business rules are testable.
 */
@Component
public class TimeProvider {

    private final Clock clock;
    private final ZoneId zone;

    public TimeProvider(Clock clock, AppProperties properties) {
        this.clock = clock;
        this.zone = properties.timeZone();
    }

    public Instant now() {
        return clock.instant();
    }

    public LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), zone);
    }

    public ZoneId zone() {
        return zone;
    }
}

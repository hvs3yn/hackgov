package com.foresight.risk.engine;

import java.time.DayOfWeek;
import java.time.LocalDate;

/**
 * Working-day arithmetic. Holidays and personal calendars are unknown (documented assumption).
 */
public final class WorkCalendar {

    private final boolean excludeWeekends;

    public WorkCalendar(boolean excludeWeekends) {
        this.excludeWeekends = excludeWeekends;
    }

    public boolean isWorkingDay(LocalDate date) {
        if (!excludeWeekends) {
            return true;
        }
        DayOfWeek day = date.getDayOfWeek();
        return day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY;
    }

    /** Working days in [from, to] inclusive; 0 if {@code to < from}. */
    public int workingDaysInclusive(LocalDate from, LocalDate to) {
        int count = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (isWorkingDay(d)) {
                count++;
            }
        }
        return count;
    }

    /** The {@code index}-th working day on or after {@code from} (index 0 = first working day). */
    public LocalDate nthWorkingDay(LocalDate from, int index) {
        LocalDate d = from;
        while (!isWorkingDay(d)) {
            d = d.plusDays(1);
        }
        int remaining = index;
        while (remaining > 0) {
            d = d.plusDays(1);
            if (isWorkingDay(d)) {
                remaining--;
            }
        }
        return d;
    }

    /** Number of working days strictly before {@code date} starting at {@code from} (0 if date <= from). */
    public int workingDayIndex(LocalDate from, LocalDate date) {
        if (!date.isAfter(from)) {
            return 0;
        }
        return workingDaysInclusive(from, date.minusDays(1));
    }
}

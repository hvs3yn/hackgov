package com.foresight.project.domain;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public enum ProjectStatus {
    ACTIVE, ON_HOLD, COMPLETED, ARCHIVED;

    private static final Map<ProjectStatus, Set<ProjectStatus>> ALLOWED = Map.of(
            ACTIVE, EnumSet.of(ON_HOLD, COMPLETED, ARCHIVED),
            ON_HOLD, EnumSet.of(ACTIVE, COMPLETED, ARCHIVED),
            COMPLETED, EnumSet.of(ACTIVE, ARCHIVED),
            ARCHIVED, EnumSet.of(ACTIVE));

    public boolean canTransitionTo(ProjectStatus target) {
        return ALLOWED.get(this).contains(target);
    }

    /** Tasks of a project in this status may be created or modified. */
    public boolean allowsTaskChanges() {
        return this == ACTIVE || this == ON_HOLD;
    }
}

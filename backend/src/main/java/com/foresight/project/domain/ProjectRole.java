package com.foresight.project.domain;

public enum ProjectRole {
    LEAD, CONTRIBUTOR, VIEWER;

    public boolean allows(Permission permission) {
        return switch (permission) {
            case VIEW -> true;
            case CONTRIBUTE -> this == LEAD || this == CONTRIBUTOR;
            case MANAGE -> this == LEAD;
        };
    }

    public enum Permission {
        /** Read the project, its tasks and risks. */
        VIEW,
        /** Create tasks, edit own tasks, manage dependencies of own tasks, trigger analysis. */
        CONTRIBUTE,
        /** Edit/archive the project, manage members, edit any task. */
        MANAGE
    }
}

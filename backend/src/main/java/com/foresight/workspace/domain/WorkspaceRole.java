package com.foresight.workspace.domain;

public enum WorkspaceRole {
    OWNER, ADMIN, MEMBER;

    public boolean isAdmin() {
        return this == OWNER || this == ADMIN;
    }
}

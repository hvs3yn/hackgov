package com.foresight.project.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "project_memberships")
public class ProjectMembership {

    @Id
    private UUID id;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private UUID workspaceId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ProjectRole role;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ProjectMembership() {
    }

    public ProjectMembership(UUID projectId, UUID workspaceId, UUID userId, ProjectRole role, Instant now) {
        this.id = UUID.randomUUID();
        this.projectId = projectId;
        this.workspaceId = workspaceId;
        this.userId = userId;
        this.role = role;
        this.createdAt = now;
    }

    public void changeRole(ProjectRole newRole) {
        this.role = newRole;
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public UUID getUserId() {
        return userId;
    }

    public ProjectRole getRole() {
        return role;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

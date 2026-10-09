package com.foresight.risk.engine.model;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Consistent, immutable view of one project taken at {@code dataVersion}.
 */
public record ProjectSnapshot(UUID projectId, String name, LocalDate startDate, LocalDate deadline,
                              long dataVersion, List<TaskSnapshot> tasks, List<Edge> edges,
                              List<MemberSnapshot> members) {

    public ProjectSnapshot {
        tasks = List.copyOf(tasks);
        edges = List.copyOf(edges);
        members = List.copyOf(members);
    }

    /** Finish-to-start edge: {@code successorId} depends on {@code predecessorId}. */
    public record Edge(UUID predecessorId, UUID successorId) {
    }

    /** @param canContribute false for VIEWERs (they cannot own tasks) */
    public record MemberSnapshot(UUID userId, String name, boolean canContribute) {
    }
}

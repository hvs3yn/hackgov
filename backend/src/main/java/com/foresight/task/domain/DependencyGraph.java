package com.foresight.task.domain;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * In-memory view of a project's finish-to-start edges used for write-time cycle prevention.
 */
public final class DependencyGraph {

    private final Map<UUID, Set<UUID>> successors = new HashMap<>();

    public DependencyGraph(Collection<TaskDependency> edges) {
        for (TaskDependency edge : edges) {
            successors.computeIfAbsent(edge.getPredecessorTaskId(), k -> new LinkedHashSet<>())
                    .add(edge.getSuccessorTaskId());
        }
    }

    /**
     * Returns the cycle that adding {@code predecessor → successor} would create (as a path
     * successor … predecessor → successor), or empty if the edge is safe.
     */
    public Optional<List<UUID>> cycleIfAdded(UUID predecessor, UUID successor) {
        if (predecessor.equals(successor)) {
            return Optional.of(List.of(predecessor, successor));
        }
        Map<UUID, UUID> parent = new HashMap<>();
        Deque<UUID> queue = new ArrayDeque<>();
        queue.add(successor);
        parent.put(successor, null);
        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            if (current.equals(predecessor)) {
                List<UUID> path = new ArrayList<>();
                for (UUID node = current; node != null; node = parent.get(node)) {
                    path.add(node);
                }
                Collections.reverse(path);
                path.add(successor);
                return Optional.of(path);
            }
            for (UUID next : successors.getOrDefault(current, Set.of())) {
                if (!parent.containsKey(next)) {
                    parent.put(next, current);
                    queue.add(next);
                }
            }
        }
        return Optional.empty();
    }
}

package com.foresight.risk.engine.graph;

import com.foresight.risk.engine.model.ProjectSnapshot.Edge;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.UUID;

/**
 * Dependency graph over task ids (ported from the original Foresight engine): deterministic topological
 * order, cycle detection, transitive downstream traversal. Edges referencing unknown tasks are ignored.
 */
public final class TaskGraph {

    private final Set<UUID> nodes;
    private final Map<UUID, Set<UUID>> successors = new HashMap<>();
    private final Map<UUID, Set<UUID>> predecessors = new HashMap<>();

    public TaskGraph(Collection<UUID> taskIds, Collection<Edge> edges) {
        this.nodes = new LinkedHashSet<>(taskIds);
        for (UUID id : nodes) {
            successors.put(id, new LinkedHashSet<>());
            predecessors.put(id, new LinkedHashSet<>());
        }
        for (Edge edge : edges) {
            if (nodes.contains(edge.predecessorId()) && nodes.contains(edge.successorId())
                    && !edge.predecessorId().equals(edge.successorId())) {
                successors.get(edge.predecessorId()).add(edge.successorId());
                predecessors.get(edge.successorId()).add(edge.predecessorId());
            }
        }
    }

    /**
     * Kahn's algorithm; ties are broken by the given comparator for deterministic output.
     *
     * @throws CycleException listing the tasks that could not be ordered
     */
    public List<UUID> topologicalOrder(Comparator<UUID> tieBreaker) {
        Map<UUID, Integer> inDegree = new LinkedHashMap<>();
        for (UUID id : nodes) {
            inDegree.put(id, predecessors.get(id).size());
        }
        PriorityQueue<UUID> ready = new PriorityQueue<>(tieBreaker);
        inDegree.forEach((id, degree) -> {
            if (degree == 0) {
                ready.add(id);
            }
        });
        List<UUID> order = new ArrayList<>(nodes.size());
        while (!ready.isEmpty()) {
            UUID current = ready.poll();
            order.add(current);
            for (UUID next : successors.get(current)) {
                int degree = inDegree.merge(next, -1, Integer::sum);
                if (degree == 0) {
                    ready.add(next);
                }
            }
        }
        if (order.size() != nodes.size()) {
            List<UUID> remaining = inDegree.entrySet().stream()
                    .filter(e -> e.getValue() > 0).map(Map.Entry::getKey).sorted().toList();
            throw new CycleException(remaining);
        }
        return order;
    }

    public Set<UUID> successorsOf(UUID id) {
        return successors.getOrDefault(id, Set.of());
    }

    public Set<UUID> predecessorsOf(UUID id) {
        return predecessors.getOrDefault(id, Set.of());
    }

    /** All transitive successors of {@code id} in BFS order, excluding {@code id}. */
    public List<UUID> downstreamOf(UUID id) {
        Set<UUID> visited = new LinkedHashSet<>();
        Deque<UUID> queue = new ArrayDeque<>(successorsOf(id));
        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            if (!current.equals(id) && visited.add(current)) {
                queue.addAll(successorsOf(current));
            }
        }
        return List.copyOf(visited);
    }
}

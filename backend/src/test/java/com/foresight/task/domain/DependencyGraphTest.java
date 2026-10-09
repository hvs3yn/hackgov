package com.foresight.task.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class DependencyGraphTest {

    private static final UUID P = UUID.randomUUID();
    private static final UUID A = UUID.randomUUID();
    private static final UUID B = UUID.randomUUID();
    private static final UUID C = UUID.randomUUID();
    private static final UUID D = UUID.randomUUID();

    /** {@code successor} depends on {@code predecessor}. */
    private static TaskDependency edge(UUID predecessor, UUID successor) {
        return new TaskDependency(P, predecessor, successor, null, Instant.EPOCH);
    }

    @Test
    void detectsCycleAndReportsPath() {
        DependencyGraph graph = new DependencyGraph(List.of(edge(A, B), edge(B, C)));
        // Adding C -> A (A depends on C) closes A -> B -> C -> A
        assertThat(graph.cycleIfAdded(C, A)).contains(List.of(A, B, C, A));
    }

    @Test
    void allowsIndependentAndDiamondEdges() {
        DependencyGraph graph = new DependencyGraph(List.of(edge(A, B), edge(A, C), edge(B, D)));
        assertThat(graph.cycleIfAdded(C, D)).isEmpty();
        assertThat(graph.cycleIfAdded(A, D)).isEmpty();
    }

    @Test
    void selfDependencyIsACycle() {
        assertThat(new DependencyGraph(List.of()).cycleIfAdded(A, A)).isPresent();
    }
}

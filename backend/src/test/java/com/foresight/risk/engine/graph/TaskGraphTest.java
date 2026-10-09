package com.foresight.risk.engine.graph;

import com.foresight.risk.engine.model.ProjectSnapshot.Edge;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskGraphTest {

    private static final UUID A = id("a");
    private static final UUID B = id("b");
    private static final UUID C = id("c");
    private static final UUID D = id("d");
    private static final Map<UUID, String> NAMES = Map.of(A, "a", B, "b", C, "c", D, "d");
    private static final Comparator<UUID> BY_NAME = Comparator.comparing(NAMES::get);

    private static UUID id(String s) {
        return UUID.nameUUIDFromBytes(s.getBytes(StandardCharsets.UTF_8));
    }

    /** {@code to} depends on {@code from}. */
    private static Edge edge(UUID from, UUID to) {
        return new Edge(from, to);
    }

    @Test
    void chainIsOrderedByDependencies() {
        TaskGraph graph = new TaskGraph(List.of(C, B, A), List.of(edge(A, B), edge(B, C)));
        assertThat(graph.topologicalOrder(BY_NAME)).containsExactly(A, B, C);
    }

    @Test
    void diamondOrdersSharedPrerequisiteFirstAndJoinLast() {
        TaskGraph graph = new TaskGraph(List.of(A, B, C, D),
                List.of(edge(A, B), edge(A, C), edge(B, D), edge(C, D)));
        assertThat(graph.topologicalOrder(BY_NAME)).containsExactly(A, B, C, D);
        assertThat(graph.downstreamOf(A)).containsExactlyInAnyOrder(B, C, D);
        assertThat(graph.predecessorsOf(D)).containsExactlyInAnyOrder(B, C);
    }

    @Test
    void cycleIsReportedWithAllInvolvedTasks() {
        TaskGraph graph = new TaskGraph(List.of(A, B, C), List.of(edge(C, A), edge(A, B), edge(B, C)));
        assertThatThrownBy(() -> graph.topologicalOrder(BY_NAME))
                .isInstanceOf(CycleException.class)
                .satisfies(e -> assertThat(((CycleException) e).cycleTaskIds()).containsExactlyInAnyOrder(A, B, C));
    }

    @Test
    void edgesToUnknownTasksAndSelfEdgesAreIgnored() {
        TaskGraph graph = new TaskGraph(List.of(A, B), List.of(edge(A, id("x")), edge(A, A), edge(A, B)));
        assertThat(graph.downstreamOf(A)).containsExactly(B);
        assertThat(graph.topologicalOrder(BY_NAME)).containsExactly(A, B);
    }

    @Test
    void downstreamOfLeafIsEmpty() {
        TaskGraph graph = new TaskGraph(Stream.of(A, B).collect(Collectors.toList()), List.of(edge(A, B)));
        assertThat(graph.downstreamOf(B)).isEmpty();
    }
}

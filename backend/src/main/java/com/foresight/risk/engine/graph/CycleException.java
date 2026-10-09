package com.foresight.risk.engine.graph;

import java.util.List;
import java.util.UUID;

public class CycleException extends RuntimeException {

    private final List<UUID> cycleTaskIds;

    public CycleException(List<UUID> cycleTaskIds) {
        super("Cycle detected involving tasks: " + cycleTaskIds);
        this.cycleTaskIds = List.copyOf(cycleTaskIds);
    }

    public List<UUID> cycleTaskIds() {
        return cycleTaskIds;
    }
}

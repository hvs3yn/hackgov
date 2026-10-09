package com.foresight.risk.engine.model;

/** How complete the input data behind a signal is. Not a probability. */
public enum Confidence {
    LOW, MEDIUM, HIGH;

    public Confidence atMost(Confidence cap) {
        return compareTo(cap) <= 0 ? this : cap;
    }
}

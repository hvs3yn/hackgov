package com.foresight.risk.engine.model;

import java.util.Map;

/**
 * A statement supporting a signal. FACTs are read directly from recorded data; INFERENCEs are derived by
 * documented rules (e.g. a projection) and must be presented as such.
 */
public record Evidence(Kind kind, String statement, Map<String, Object> data) {

    public enum Kind {FACT, INFERENCE}

    public Evidence {
        data = data == null ? Map.of() : Map.copyOf(data);
    }

    public static Evidence fact(String statement) {
        return new Evidence(Kind.FACT, statement, Map.of());
    }

    public static Evidence fact(String statement, Map<String, Object> data) {
        return new Evidence(Kind.FACT, statement, data);
    }

    public static Evidence inference(String statement) {
        return new Evidence(Kind.INFERENCE, statement, Map.of());
    }

    public static Evidence inference(String statement, Map<String, Object> data) {
        return new Evidence(Kind.INFERENCE, statement, data);
    }
}

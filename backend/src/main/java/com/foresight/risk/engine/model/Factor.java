package com.foresight.risk.engine.model;

/** One contribution to a risk score; points may be negative (mitigating factor). */
public record Factor(String code, String description, int points) {
}

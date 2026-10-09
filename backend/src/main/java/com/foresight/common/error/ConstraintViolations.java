package com.foresight.common.error;

import org.springframework.dao.DataIntegrityViolationException;

/** Identifies which database constraint a {@link DataIntegrityViolationException} came from. */
public final class ConstraintViolations {

    private ConstraintViolations() {
    }

    /** True if the violation was raised by the named constraint (e.g. {@code uk_users_email}). */
    public static boolean isViolationOf(DataIntegrityViolationException e, String constraintName) {
        return String.valueOf(e.getMostSpecificCause().getMessage()).contains(constraintName);
    }
}

package com.foresight.identity.application;

import java.util.UUID;

/** Public, minimal view of a user shared with other modules. */
public record UserSummary(UUID id, String fullName, String email) {
}

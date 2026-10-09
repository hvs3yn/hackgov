package com.foresight.recommendation.application;

/**
 * Pluggable generator of explanation wording and recommendations. Implementations must not access the
 * database or perform side effects; they only transform the given request.
 */
public interface AiProvider {

    /** Short identifier stored as the explanation source, e.g. {@code ANTHROPIC}. */
    String name();

    boolean isEnabled();

    AiExplanationPayload generate(ExplanationRequest request) throws AiProviderException;

    class AiProviderException extends Exception {

        private final String reason;

        public AiProviderException(String reason, String message, Throwable cause) {
            super(message, cause);
            this.reason = reason;
        }

        public AiProviderException(String reason, String message) {
            this(reason, message, null);
        }

        /** Metric-friendly reason: timeout, rate_limited, api_error, refusal, truncated, invalid_output, io_error. */
        public String reason() {
            return reason;
        }
    }
}

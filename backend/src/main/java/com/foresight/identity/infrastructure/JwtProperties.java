package com.foresight.identity.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.security")
public record JwtProperties(
        @DefaultValue("12") int bcryptStrength,
        @DefaultValue Jwt jwt) {

    public record Jwt(
            String secret,
            @DefaultValue("foresight") String issuer,
            @DefaultValue("PT15M") Duration accessTokenTtl,
            @DefaultValue("P14D") Duration refreshTokenTtl,
            @DefaultValue("false") boolean allowEphemeralSecret) {
    }
}

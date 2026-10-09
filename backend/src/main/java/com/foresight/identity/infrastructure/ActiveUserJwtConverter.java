package com.foresight.identity.infrastructure;

import com.foresight.identity.domain.UserRepository;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Accepts a signature-valid JWT only if its subject is an existing, enabled user.
 */
@Component
public class ActiveUserJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final UserRepository users;

    public ActiveUserJwtConverter(UserRepository users) {
        this.users = users;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        UUID userId;
        try {
            userId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new InvalidBearerTokenException("Invalid subject");
        }
        if (!users.existsByIdAndEnabledTrue(userId)) {
            throw new InvalidBearerTokenException("User is not active");
        }
        return new JwtAuthenticationToken(jwt, List.of(), userId.toString());
    }
}

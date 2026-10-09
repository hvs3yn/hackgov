package com.foresight.identity.application;

import com.foresight.common.error.ApiException;
import com.foresight.common.error.ConstraintViolations;
import com.foresight.common.time.TimeProvider;
import com.foresight.identity.domain.RefreshToken;
import com.foresight.identity.domain.RefreshTokenRepository;
import com.foresight.identity.domain.User;
import com.foresight.identity.domain.UserRepository;
import com.foresight.identity.infrastructure.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final TimeProvider time;
    private final String dummyHash;

    public AuthService(UserRepository users, RefreshTokenRepository refreshTokens, PasswordEncoder passwordEncoder,
                       TokenService tokenService, TimeProvider time) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.time = time;
        this.dummyHash = passwordEncoder.encode("dummy-password-for-timing-1");
    }

    public record AuthResult(UserSummary user, String accessToken, long expiresIn,
                             String refreshToken, long refreshExpiresIn, Instant createdAt) {
    }

    @Transactional
    public AuthResult register(String fullName, String email, String password) {
        String normalized = User.normalizeEmail(email);
        if (users.existsByEmail(normalized)) {
            throw emailTaken();
        }
        User user = new User(fullName, normalized, passwordEncoder.encode(password), time.now());
        try {
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // Only the unique e-mail constraint means "taken" (concurrent registration); anything else, e.g.
            // unstorable characters, is reported by the global handler.
            if (ConstraintViolations.isViolationOf(e, "uk_users_email")) {
                throw emailTaken();
            }
            throw e;
        }
        log.info("Registered user {}", user.getId());
        return issueTokens(user);
    }

    @Transactional
    public AuthResult login(String email, String password) {
        Optional<User> found = users.findByEmail(User.normalizeEmail(email));
        // Failures are logged with a reason (never the e-mail or password) to make login problems diagnosable;
        // the client always receives the same uniform error.
        if (found.isEmpty()) {
            passwordEncoder.matches(password, dummyHash);
            log.info("Login failed: no account for the given e-mail");
            throw invalidCredentials();
        }
        User user = found.get();
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            log.info("Login failed for user {}: wrong password", user.getId());
            throw invalidCredentials();
        }
        if (!user.isEnabled()) {
            log.info("Login failed for user {}: account disabled", user.getId());
            throw invalidCredentials();
        }
        return issueTokens(user);
    }

    /**
     * Rotates a refresh token. Presenting an already rotated/revoked token revokes every token of that user
     * (the revocation is committed even though the call fails).
     */
    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult refresh(String refreshToken) {
        Instant now = time.now();
        RefreshToken token = refreshTokens.findByHashForUpdate(tokenService.hash(refreshToken))
                .orElseThrow(AuthService::invalidRefreshToken);
        if (token.isRevoked()) {
            int revoked = refreshTokens.revokeAllForUser(token.getUserId(), now);
            log.warn("Refresh token reuse detected for user {}; revoked {} tokens", token.getUserId(), revoked);
            throw invalidRefreshToken();
        }
        if (token.isExpired(now)) {
            throw invalidRefreshToken();
        }
        User user = users.findById(token.getUserId())
                .filter(User::isEnabled)
                .orElseThrow(AuthService::invalidRefreshToken);
        String newValue = tokenService.newRefreshTokenValue();
        RefreshToken replacement = new RefreshToken(user.getId(), tokenService.hash(newValue), now,
                tokenService.refreshExpiry(now));
        refreshTokens.save(replacement);
        token.rotate(replacement.getId(), now);
        return result(user, newValue, now);
    }

    @Transactional
    public void logout(String refreshToken) {
        refreshTokens.findByTokenHash(tokenService.hash(refreshToken)).ifPresent(t -> t.revoke(time.now()));
    }

    @Transactional(readOnly = true)
    public UserSummary me(UUID userId) {
        return users.findById(userId).map(UserDirectory::toSummary)
                .orElseThrow(() -> ApiException.unauthorized("UNAUTHENTICATED", "Authentication required"));
    }

    @Transactional(readOnly = true)
    public Instant createdAt(UUID userId) {
        return users.findById(userId).map(User::getCreatedAt).orElse(null);
    }

    private AuthResult issueTokens(User user) {
        Instant now = time.now();
        String refreshValue = tokenService.newRefreshTokenValue();
        refreshTokens.save(new RefreshToken(user.getId(), tokenService.hash(refreshValue), now,
                tokenService.refreshExpiry(now)));
        return result(user, refreshValue, now);
    }

    private AuthResult result(User user, String refreshValue, Instant now) {
        return new AuthResult(UserDirectory.toSummary(user), tokenService.issueAccessToken(user, now),
                tokenService.accessTokenTtlSeconds(), refreshValue, tokenService.refreshTokenTtlSeconds(),
                user.getCreatedAt());
    }

    private static ApiException emailTaken() {
        return ApiException.conflict("EMAIL_TAKEN", "An account with this email already exists");
    }

    private static ApiException invalidCredentials() {
        return ApiException.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
    }

    private static ApiException invalidRefreshToken() {
        return ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
    }
}

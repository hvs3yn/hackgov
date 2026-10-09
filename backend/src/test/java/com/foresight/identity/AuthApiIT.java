package com.foresight.identity;

import com.foresight.support.Api.User;
import com.foresight.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.Duration;

import static com.foresight.support.Api.body;
import static org.assertj.core.api.Assertions.assertThat;

class AuthApiIT extends IntegrationTest {

    @Test
    void registerLoginAndReadProfile() {
        User ulvi = api.register("Ulvi Mammadov", "  Ulvi@Example.com ");
        assertThat(ulvi.email()).isNotBlank();

        var me = api.get(ulvi, "/api/v1/users/me");
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.text("email")).isEqualTo("ulvi@example.com");
        assertThat(me.json().has("passwordHash")).isFalse();

        var login = api.post(null, "/api/v1/auth/login", body("email", "ULVI@example.com", "password", "Password123"));
        assertThat(login.status()).isEqualTo(200);
        assertThat(login.text("tokenType")).isEqualTo("Bearer");
        assertThat(login.json().path("expiresIn").asLong()).isEqualTo(60L * 24 * 3600); // test profile TTL
    }

    @Test
    void duplicateEmailIsRejectedWithConflict() {
        api.register("A", "dup@example.com");
        var r = api.post(null, "/api/v1/auth/register",
                body("fullName", "B", "email", "DUP@example.com", "password", "Password123"));
        assertThat(r.status()).isEqualTo(409);
        assertThat(r.code()).isEqualTo("EMAIL_TAKEN");
    }

    @Test
    void invalidRegistrationInputIsRejected() {
        var r = api.post(null, "/api/v1/auth/register", body("fullName", "", "email", "not-an-email", "password", "short"));
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.code()).isEqualTo("VALIDATION_FAILED");
        assertThat(r.json().path("errors").size()).isGreaterThanOrEqualTo(3);

        var unknownField = api.post(null, "/api/v1/auth/register",
                "{\"fullName\":\"X\",\"email\":\"x@example.com\",\"password\":\"Password123\",\"admin\":true}");
        assertThat(unknownField.status()).isEqualTo(400);
        assertThat(unknownField.code()).isEqualTo("MALFORMED_REQUEST");
    }

    @Test
    void wrongPasswordAndUnknownUserGiveTheSameError() {
        api.register("A", "a@example.com");
        var wrong = api.post(null, "/api/v1/auth/login", body("email", "a@example.com", "password", "Wrong12345"));
        var unknown = api.post(null, "/api/v1/auth/login", body("email", "nobody@example.com", "password", "Wrong12345"));
        assertThat(wrong.status()).isEqualTo(401);
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(wrong.code()).isEqualTo("INVALID_CREDENTIALS").isEqualTo(unknown.code());
    }

    @Test
    void privateEndpointsRequireAValidToken() {
        assertThat(api.get(null, "/api/v1/users/me").status()).isEqualTo(401);
        var forged = api.raw(MockMvcRequestBuilders.get("/api/v1/users/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid"));
        assertThat(forged.status()).isEqualTo(401);
        assertThat(forged.code()).isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void expiredAccessTokenIsRejected() {
        User u = api.register("A", "exp@example.com");
        clock.advance(Duration.ofDays(60).plusSeconds(30));
        assertThat(api.get(u, "/api/v1/users/me").status()).isEqualTo(200); // within the 60 s clock-skew allowance
        clock.advance(Duration.ofMinutes(2));
        assertThat(api.get(u, "/api/v1/users/me").status()).isEqualTo(401);
    }

    @Test
    void refreshTokensRotateAndReuseRevokesTheFamily() {
        User u = api.register("A", "r@example.com");
        var first = api.post(null, "/api/v1/auth/refresh", body("refreshToken", u.refreshToken()));
        assertThat(first.status()).isEqualTo(200);
        String rotated = first.text("refreshToken");
        assertThat(rotated).isNotEqualTo(u.refreshToken());

        // Reusing the old token is treated as theft: it fails and the rotated token is revoked too.
        var reuse = api.post(null, "/api/v1/auth/refresh", body("refreshToken", u.refreshToken()));
        assertThat(reuse.status()).isEqualTo(401);
        assertThat(reuse.code()).isEqualTo("INVALID_REFRESH_TOKEN");
        assertThat(api.post(null, "/api/v1/auth/refresh", body("refreshToken", rotated)).status()).isEqualTo(401);
    }

    @Test
    void logoutRevokesRefreshToken() {
        User u = api.register("A", "l@example.com");
        assertThat(api.post(null, "/api/v1/auth/logout", body("refreshToken", u.refreshToken())).status()).isEqualTo(204);
        assertThat(api.post(null, "/api/v1/auth/refresh", body("refreshToken", u.refreshToken())).status()).isEqualTo(401);
    }

    @Test
    void staleBearerHeaderDoesNotBlockPublicAuthEndpoints() {
        User u = api.register("A", "stale@example.com");
        for (String path : new String[]{"/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/register"}) {
            Object body = switch (path) {
                case "/api/v1/auth/login" -> body("email", "stale@example.com", "password", "Password123");
                case "/api/v1/auth/refresh" -> body("refreshToken", u.refreshToken());
                default -> body("fullName", "B", "email", "fresh@example.com", "password", "Password123");
            };
            var r = api.raw(MockMvcRequestBuilders.post(path)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer expired.or.garbage")
                    .contentType("application/json").content(com.foresight.support.Api.JSON.writeValueAsString(body)));
            assertThat(r.status()).as(path).isIn(200, 201);
        }
        // Protected endpoints still reject the invalid token.
        assertThat(api.raw(MockMvcRequestBuilders.get("/api/v1/users/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer expired.or.garbage")).status()).isEqualTo(401);
    }

    @Test
    void corsAllowsLocalFrontendsOnAnyPortWithCredentials() {
        for (String origin : new String[]{"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4200"}) {
            var r = api.raw(MockMvcRequestBuilders.options("/api/v1/auth/login")
                    .header("Origin", origin)
                    .header("Access-Control-Request-Method", "POST")
                    .header("Access-Control-Request-Headers", "content-type,authorization"));
            assertThat(r.status()).as(origin).isEqualTo(200);
            assertThat(r.raw().getResponse().getHeader("Access-Control-Allow-Origin")).isEqualTo(origin);
            assertThat(r.raw().getResponse().getHeader("Access-Control-Allow-Credentials")).isEqualTo("true");
        }
        var foreign = api.raw(MockMvcRequestBuilders.options("/api/v1/auth/login")
                .header("Origin", "https://evil.example.com")
                .header("Access-Control-Request-Method", "POST"));
        assertThat(foreign.status()).isEqualTo(403);
    }

    @Test
    void wrongMethodAndUnstorableInputGiveAccurateErrors() {
        var get = api.get(null, "/api/v1/auth/login");
        assertThat(get.status()).isEqualTo(405);
        assertThat(get.code()).isEqualTo("METHOD_NOT_ALLOWED");

        var nulLogin = api.post(null, "/api/v1/auth/login", body("email", "a\u0000@example.com", "password", "Password123"));
        assertThat(nulLogin.status()).isEqualTo(400);

        // A NUL character in the name must not be reported as "email taken".
        var nulName = api.post(null, "/api/v1/auth/register",
                body("fullName", "Bad\u0000Name", "email", "nul@example.com", "password", "Password123"));
        assertThat(nulName.status()).isEqualTo(400);
        assertThat(nulName.code()).isEqualTo("INVALID_ARGUMENT");

        var wrongType = api.post(null, "/api/v1/auth/login", body("email", 5, "password", true));
        assertThat(wrongType.status()).isEqualTo(400);
    }

    @Test
    void healthIsPublicAndErrorsCarryRequestId() {
        assertThat(api.get(null, "/actuator/health").status()).isEqualTo(200);
        var r = api.get(null, "/api/v1/users/me");
        assertThat(r.raw().getResponse().getHeader("X-Request-Id")).isNotBlank();
    }
}

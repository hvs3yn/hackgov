package com.foresight.identity.api;

import com.foresight.identity.application.AuthService;
import com.foresight.identity.application.UserSummary;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 120) String fullName,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 128)
            @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "must contain at least one letter and one digit")
            String password) {
        public RegisterRequest {
            email = email == null ? null : email.strip();
            fullName = fullName == null ? null : fullName.strip();
        }
    }

    public record LoginRequest(@NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 128) String password) {
        public LoginRequest {
            email = email == null ? null : email.strip();
        }
    }

    public record RefreshRequest(@NotBlank @Size(max = 200) String refreshToken) {
    }

    public record UserResponse(UUID id, String fullName, String email, Instant createdAt) {
        static UserResponse of(UserSummary user, Instant createdAt) {
            return new UserResponse(user.id(), user.fullName(), user.email(), createdAt);
        }
    }

    public record AuthResponse(String accessToken, String tokenType, long expiresIn, String refreshToken,
                               long refreshExpiresIn, UserResponse user) {
        static AuthResponse of(AuthService.AuthResult result) {
            return new AuthResponse(result.accessToken(), "Bearer", result.expiresIn(), result.refreshToken(),
                    result.refreshExpiresIn(), UserResponse.of(result.user(), result.createdAt()));
        }
    }
}

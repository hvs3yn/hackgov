package com.foresight.identity.api;

import com.foresight.common.security.CurrentUser;
import com.foresight.identity.api.AuthDtos.AuthResponse;
import com.foresight.identity.api.AuthDtos.LoginRequest;
import com.foresight.identity.api.AuthDtos.RefreshRequest;
import com.foresight.identity.api.AuthDtos.RegisterRequest;
import com.foresight.identity.api.AuthDtos.UserResponse;
import com.foresight.identity.application.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Authentication")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    @SecurityRequirements
    @Operation(summary = "Register a new user and receive tokens")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return AuthResponse.of(authService.register(request.fullName(), request.email(), request.password()));
    }

    @PostMapping("/auth/login")
    @SecurityRequirements
    @Operation(summary = "Log in with email and password")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return AuthResponse.of(authService.login(request.email(), request.password()));
    }

    @PostMapping("/auth/refresh")
    @SecurityRequirements
    @Operation(summary = "Exchange a refresh token for new tokens (rotation)")
    public AuthResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return AuthResponse.of(authService.refresh(request.refreshToken()));
    }

    @PostMapping("/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirements
    @Operation(summary = "Revoke a refresh token")
    public void logout(@Valid @RequestBody RefreshRequest request) {
        authService.logout(request.refreshToken());
    }

    @GetMapping("/users/me")
    @Operation(summary = "Current user's profile")
    public UserResponse me() {
        UUID userId = CurrentUser.id();
        return UserResponse.of(authService.me(userId), authService.createdAt(userId));
    }
}

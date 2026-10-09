package com.foresight.identity.infrastructure;

import com.foresight.common.config.AppProperties;
import com.foresight.common.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stateless bearer-token security. CSRF is disabled because no cookies or other ambient credentials are used.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    /** All authentication endpoints are public for every method, so a wrong method yields 405, not 401. */
    private static final String PUBLIC_AUTH = "/api/v1/auth/**";
    private static final String[] PUBLIC_DOCS = {
            "/actuator/health", "/actuator/health/**", "/actuator/info",
            "/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html", "/swagger-ui/**", "/error"};

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ActiveUserJwtConverter converter,
                                           JsonMapper jsonMapper) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> {
                })
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_AUTH).permitAll()
                        .requestMatchers(PUBLIC_DOCS).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth
                        .bearerTokenResolver(publicEndpointAwareResolver())
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(converter))
                        .authenticationEntryPoint((request, response, ex) ->
                                writeProblem(jsonMapper, request, response, HttpStatus.UNAUTHORIZED,
                                        "UNAUTHENTICATED", "A valid bearer token is required"))
                        .accessDeniedHandler((request, response, ex) ->
                                writeProblem(jsonMapper, request, response, HttpStatus.FORBIDDEN,
                                        "FORBIDDEN", "You are not allowed to perform this action")))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, e) ->
                                writeProblem(jsonMapper, request, response, HttpStatus.UNAUTHORIZED,
                                        "UNAUTHENTICATED", "A valid bearer token is required"))
                        .accessDeniedHandler((request, response, e) ->
                                writeProblem(jsonMapper, request, response, HttpStatus.FORBIDDEN,
                                        "FORBIDDEN", "You are not allowed to perform this action")));
        return http.build();
    }

    /**
     * Public endpoints (login, register, refresh, logout, docs, health) ignore any Authorization header.
     * Clients often attach a stored – possibly expired – token to every request; without this, such a stale
     * header would make login itself fail with 401 and lock the user out.
     */
    static BearerTokenResolver publicEndpointAwareResolver() {
        DefaultBearerTokenResolver delegate = new DefaultBearerTokenResolver();
        PathPatternRequestMatcher.Builder paths = PathPatternRequestMatcher.withDefaults();
        List<RequestMatcher> publicMatchers = new java.util.ArrayList<>();
        publicMatchers.add(paths.matcher(PUBLIC_AUTH));
        for (String path : PUBLIC_DOCS) {
            publicMatchers.add(paths.matcher(path));
        }
        RequestMatcher isPublic = new OrRequestMatcher(publicMatchers);
        return request -> isPublic.matches(request) ? null : delegate.resolve(request);
    }

    /**
     * Origins may be exact values or patterns such as {@code http://localhost:[*]}. Credentials are allowed so
     * clients using {@code withCredentials}/{@code credentials: 'include'} work; authentication itself never
     * relies on cookies, so this does not enable CSRF.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties properties) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(properties.cors().allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", RequestIdFilter.HEADER));
        config.setExposedHeaders(List.of(RequestIdFilter.HEADER, "Retry-After"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    private static void writeProblem(JsonMapper mapper, HttpServletRequest request, HttpServletResponse response,
                                     HttpStatus status, String code, String detail) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "about:blank");
        body.put("title", status.getReasonPhrase());
        body.put("status", status.value());
        body.put("detail", detail);
        body.put("instance", request.getRequestURI());
        body.put("code", code);
        body.put("timestamp", Instant.now().toString());
        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        if (requestId != null) {
            body.put("requestId", requestId);
        }
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), body);
    }
}

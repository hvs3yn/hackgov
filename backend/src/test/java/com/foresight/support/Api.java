package com.foresight.support;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/** Small fluent HTTP helper over MockMvc for API-level tests. */
public class Api {

    public static final JsonMapper JSON = JsonMapper.builder().build();

    private final MockMvc mvc;

    public Api(MockMvc mvc) {
        this.mvc = mvc;
    }

    public record Response(int status, JsonNode body, MvcResult raw) {
        public JsonNode json() {
            return body;
        }

        public String text(String field) {
            return body.path(field).asString();
        }

        public String code() {
            return body.path("code").asString();
        }
    }

    public record User(String id, String email, String token, String refreshToken) {
    }

    public static Map<String, Object> body(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }

    public User register(String fullName, String email) {
        Response r = post(null, "/api/v1/auth/register",
                body("fullName", fullName, "email", email, "password", "Password123"));
        if (r.status() != 201) {
            throw new IllegalStateException("Registration failed: " + r.status() + " " + r.body());
        }
        return new User(r.body().path("user").path("id").asString(), email, r.text("accessToken"),
                r.text("refreshToken"));
    }

    public Response get(User user, String path) {
        return exec(user, MockMvcRequestBuilders.get(path));
    }

    public Response post(User user, String path, Object body) {
        return exec(user, withBody(MockMvcRequestBuilders.post(path), body));
    }

    public Response put(User user, String path, Object body) {
        return exec(user, withBody(MockMvcRequestBuilders.put(path), body));
    }

    public Response patch(User user, String path, Object body) {
        return exec(user, withBody(MockMvcRequestBuilders.patch(path), body));
    }

    public Response delete(User user, String path) {
        return exec(user, MockMvcRequestBuilders.delete(path));
    }

    public Response raw(MockHttpServletRequestBuilder request) {
        return exec(null, request);
    }

    private static MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder builder, Object body) {
        if (body == null) {
            return builder;
        }
        String content = body instanceof String s ? s : JSON.writeValueAsString(body);
        return builder.contentType(MediaType.APPLICATION_JSON).content(content);
    }

    private Response exec(User user, MockHttpServletRequestBuilder request) {
        if (user != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + user.token());
        }
        try {
            MvcResult result = mvc.perform(request).andReturn();
            String content = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
            JsonNode node;
            if (content.isBlank()) {
                node = JSON.createObjectNode();
            } else if (content.startsWith("{") || content.startsWith("[")) {
                node = JSON.readTree(content);
            } else {
                node = JSON.getNodeFactory().textNode(content); // e.g. plain-text CORS rejection
            }
            return new Response(result.getResponse().getStatus(), node, result);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

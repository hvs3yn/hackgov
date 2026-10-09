package com.foresight.support;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.mongodb.MongoDBContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.time.Clock;
import java.time.Instant;

/**
 * Base class for integration tests: full Spring context, MockMvc, real PostgreSQL and MongoDB (Testcontainers,
 * shared by all test classes), a controllable clock and a clean database before each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(IntegrationTest.TestClockConfig.class)
public abstract class IntegrationTest {

    /** Wednesday 2026-10-14 10:00 UTC. */
    public static final Instant START = Instant.parse("2026-10-14T10:00:00Z");

    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @ServiceConnection
    static final MongoDBContainer MONGO = new MongoDBContainer("mongo:8");

    static {
        POSTGRES.start();
        MONGO.start();
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected JdbcTemplate jdbc;

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected MongoTemplate mongo;

    protected Api api;

    @BeforeEach
    void resetState() {
        jdbc.execute("""
                TRUNCATE inbox_items, risk_assessment_events, risk_assessments, task_activities, task_dependencies,
                         tasks, project_memberships, projects, workspace_memberships, workspaces, refresh_tokens, users
                CASCADE""");
        mongo.remove(new Query(), "ai_generations");
        clock.set(START);
        api = new Api(mvc);
    }

    /** The primary {@link Clock} of the test context is a {@link MutableClock}. */
    @TestConfiguration
    static class TestClockConfig {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock(START);
        }
    }
}

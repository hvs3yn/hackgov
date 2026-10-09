package com.foresight;

import com.foresight.inbox.application.RiskAlertDeliveryService;
import com.foresight.risk.application.RiskAnalysisService;
import com.foresight.support.Api;
import com.foresight.support.IntegrationTest;
import com.foresight.support.Scenario;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static com.foresight.support.Api.body;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Concurrency guarantees backed by the database (row locks, optimistic versions, unique constraints).
 */
class ConcurrencyIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 14);

    @Autowired
    RiskAnalysisService analysis;

    @Autowired
    RiskAlertDeliveryService delivery;

    private static <T> List<T> runConcurrently(int threads, Callable<T> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return task.call();
                }));
            }
            start.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> f : futures) {
                results.add(f.get());
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void oppositeDependenciesCannotBothBeCreated() throws Exception {
        Scenario s = new Scenario(api, TODAY.plusDays(30));
        String a = s.task(s.aydan, "A", null, null, null, "MEDIUM");
        String b = s.task(s.aydan, "B", null, null, null, "MEDIUM");
        List<Integer> statuses = new ArrayList<>();
        for (int round = 0; round < 1; round++) {
            List<Callable<Integer>> calls = List.of(
                    () -> s.depend(s.aydan, b, a).status(),
                    () -> s.depend(s.aydan, a, b).status());
            ExecutorService pool = Executors.newFixedThreadPool(2);
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Integer>> futures = new ArrayList<>();
            for (Callable<Integer> c : calls) {
                futures.add(pool.submit(() -> {
                    go.await();
                    return c.call();
                }));
            }
            go.countDown();
            for (Future<Integer> f : futures) {
                statuses.add(f.get());
            }
            pool.shutdown();
        }
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        assertThat(jdbc.queryForObject("select count(*) from task_dependencies", Integer.class)).isEqualTo(1);
    }

    @Test
    void concurrentUpdatesWithTheSameVersionLetExactlyOneWin() throws Exception {
        Scenario s = new Scenario(api, TODAY.plusDays(30));
        String t = s.task(s.aydan, "Shared", s.ulvi, null, null, "MEDIUM");
        long version = s.version(t);
        List<Integer> statuses = runConcurrently(4, () -> api.put(s.aydan, "/api/v1/tasks/" + t,
                body("version", version, "title", "Title " + UUID.randomUUID(), "priority", "HIGH")).status());
        assertThat(statuses).containsOnlyOnce(200);
        assertThat(statuses).filteredOn(code -> code == 409).hasSize(3);
    }

    @Test
    void concurrentAnalysesAndDeliveriesNeverDuplicateAssessmentsOrInboxItems() throws Exception {
        Scenario s = new Scenario(api, TODAY.plusDays(30));
        s.task(s.aydan, "Late report", s.ulvi, TODAY.minusDays(3), 4.0, "HIGH");
        s.task(s.aydan, "Late slides", s.huseyn, TODAY.minusDays(1), 4.0, "CRITICAL");
        UUID projectId = UUID.fromString(s.projectId);

        runConcurrently(6, () -> analysis.analyze(projectId));
        runConcurrently(6, () -> delivery.deliverPending(50));

        Integer duplicates = jdbc.queryForObject("""
                select count(*) from (select project_id, fingerprint from risk_assessments
                                      group by project_id, fingerprint having count(*) > 1) d""", Integer.class);
        assertThat(duplicates).isZero();
        Integer duplicateItems = jdbc.queryForObject("""
                select count(*) from (select assessment_id, recipient_id from inbox_items
                                      group by assessment_id, recipient_id having count(*) > 1) d""", Integer.class);
        assertThat(duplicateItems).isZero();
        Integer events = jdbc.queryForObject(
                "select count(*) from risk_assessment_events where event_type = 'DETECTED'", Integer.class);
        Integer assessments = jdbc.queryForObject("select count(*) from risk_assessments", Integer.class);
        assertThat(events).as("each risk detected exactly once").isEqualTo(assessments);
        assertThat(jdbc.queryForObject(
                "select count(*) from risk_assessments where delivery_status not in ('DELIVERED','NOT_REQUIRED')",
                Integer.class)).isZero();
    }

    @Test
    void concurrentDuplicateRegistrationsCreateOneUser() throws Exception {
        Api local = api;
        List<Integer> statuses = runConcurrently(5, () -> local.post(null, "/api/v1/auth/register",
                body("fullName", "Twin", "email", "twin@example.com", "password", "Password123")).status());
        assertThat(statuses).containsOnlyOnce(201);
        assertThat(statuses).filteredOn(code -> code == 409).hasSize(4);
        assertThat(jdbc.queryForObject("select count(*) from users where email = 'twin@example.com'", Integer.class))
                .isEqualTo(1);
    }
}

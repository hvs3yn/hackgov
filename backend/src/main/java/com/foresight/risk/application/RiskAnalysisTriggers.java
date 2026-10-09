package com.foresight.risk.application;

import com.foresight.project.application.ProjectEvents.ProjectDataChangedEvent;
import com.foresight.project.application.ProjectQueryApi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Periodic and change-triggered analysis. The in-memory coalescing set is only an optimization; correctness
 * relies on the reconciliation lock and stale checks, and the periodic run is the safety net.
 */
@Component
public class RiskAnalysisTriggers {

    private static final Logger log = LoggerFactory.getLogger(RiskAnalysisTriggers.class);
    private static final int PAGE_SIZE = 50;

    private final RiskAnalysisService analysis;
    private final ProjectQueryApi projects;
    private final RiskProperties properties;
    private final TaskScheduler scheduler;
    private final Set<UUID> pending = ConcurrentHashMap.newKeySet();

    public RiskAnalysisTriggers(RiskAnalysisService analysis, ProjectQueryApi projects, RiskProperties properties,
                                TaskScheduler scheduler) {
        this.analysis = analysis;
        this.projects = projects;
        this.properties = properties;
        this.scheduler = scheduler;
    }

    @Scheduled(fixedDelayString = "${app.risk.analysis-interval:PT15M}",
            initialDelayString = "${app.risk.analysis-initial-delay:PT1M}")
    public void analyzeActiveProjects() {
        if (!properties.schedulingEnabled()) {
            return;
        }
        int analyzed = 0;
        int failed = 0;
        int pageNumber = 0;
        Page<UUID> page;
        do {
            page = projects.activeProjectIds(PageRequest.of(pageNumber++, PAGE_SIZE));
            for (UUID projectId : page) {
                try {
                    analysis.analyze(projectId);
                    analyzed++;
                } catch (RuntimeException e) {
                    failed++;
                    log.warn("Scheduled analysis of project {} failed: {}", projectId, e.toString());
                }
            }
        } while (page.hasNext());
        log.info("Scheduled risk analysis finished: {} projects analysed, {} failed", analyzed, failed);
    }

    @TransactionalEventListener
    public void onProjectDataChanged(ProjectDataChangedEvent event) {
        if (!properties.onChangeEnabled()) {
            return;
        }
        UUID projectId = event.projectId();
        if (pending.add(projectId)) {
            scheduler.schedule(() -> runDebounced(projectId), Instant.now().plus(properties.onChangeDebounce()));
        }
    }

    private void runDebounced(UUID projectId) {
        pending.remove(projectId);
        try {
            analysis.analyze(projectId);
        } catch (RuntimeException e) {
            log.warn("Change-triggered analysis of project {} failed: {}", projectId, e.toString());
        }
    }
}

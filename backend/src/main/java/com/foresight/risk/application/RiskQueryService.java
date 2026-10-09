package com.foresight.risk.application;

import com.foresight.common.error.ApiException;
import com.foresight.project.application.ProjectAccessService;
import com.foresight.project.application.ProjectQueryApi;
import com.foresight.project.domain.ProjectRole.Permission;
import com.foresight.risk.application.RiskViews.RiskDetailView;
import com.foresight.risk.application.RiskViews.RiskEventView;
import com.foresight.risk.application.RiskViews.RiskSummaryView;
import com.foresight.risk.application.RiskViews.RiskView;
import com.foresight.risk.application.explanation.ExplanationPort;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.domain.RiskAssessmentEventRepository;
import com.foresight.risk.domain.RiskAssessmentRepository;
import com.foresight.risk.domain.RiskEnums.AssessmentStatus;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;
import com.foresight.task.application.TaskQueryApi;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class RiskQueryService {

    private final RiskAssessmentRepository assessments;
    private final RiskAssessmentEventRepository events;
    private final ProjectAccessService access;
    private final ProjectQueryApi projects;
    private final TaskQueryApi tasks;
    private final AssessmentJson json;
    private final ExplanationPort explanations;

    public RiskQueryService(RiskAssessmentRepository assessments, RiskAssessmentEventRepository events,
                            ProjectAccessService access, ProjectQueryApi projects, TaskQueryApi tasks,
                            AssessmentJson json, ExplanationPort explanations) {
        this.assessments = assessments;
        this.events = events;
        this.access = access;
        this.projects = projects;
        this.tasks = tasks;
        this.json = json;
        this.explanations = explanations;
    }

    public record RiskFilter(List<AssessmentStatus> statuses, List<Severity> severities,
                             List<RiskCategory> categories, UUID taskId) {
    }

    public Page<RiskView> list(UUID actorId, UUID projectId, RiskFilter filter, Pageable pageable) {
        access.require(projectId, actorId, Permission.VIEW);
        Specification<RiskAssessment> spec = (root, q, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("projectId"), projectId));
            List<AssessmentStatus> statuses = filter.statuses() == null || filter.statuses().isEmpty()
                    ? List.of(AssessmentStatus.ACTIVE) : filter.statuses();
            p.add(root.get("status").in(statuses));
            if (filter.severities() != null && !filter.severities().isEmpty()) {
                p.add(root.get("severity").in(filter.severities()));
            }
            if (filter.categories() != null && !filter.categories().isEmpty()) {
                p.add(root.get("category").in(filter.categories()));
            }
            if (filter.taskId() != null) {
                p.add(cb.equal(root.get("taskId"), filter.taskId()));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return assessments.findAll(spec, pageable).map(a -> RiskView.of(a, json));
    }

    public RiskDetailView detail(UUID actorId, UUID riskId) {
        RiskAssessment a = requireVisible(actorId, riskId);
        return new RiskDetailView(RiskView.of(a, json), json.factors(a), json.evidence(a), json.missingData(a),
                explanationOf(a));
    }

    public Page<RiskEventView> history(UUID actorId, UUID riskId, Pageable pageable) {
        requireVisible(actorId, riskId);
        return events.findByAssessmentId(riskId, pageable).map(RiskEventView::of);
    }

    public List<RiskView> activeForTask(UUID actorId, UUID taskId) {
        UUID projectId = tasks.projectIdOfActiveTask(taskId).orElseThrow(() -> ApiException.notFound("Task"));
        access.require(projectId, actorId, Permission.VIEW);
        return assessments.findByTaskIdAndStatus(taskId, AssessmentStatus.ACTIVE).stream()
                .sorted(Comparator.comparingInt(RiskAssessment::getScore).reversed())
                .map(a -> RiskView.of(a, json))
                .toList();
    }

    public RiskSummaryView summary(UUID actorId, UUID projectId) {
        access.require(projectId, actorId, Permission.VIEW);
        List<RiskAssessment> active = assessments.findByProjectIdAndStatus(projectId, AssessmentStatus.ACTIVE);
        Map<Severity, Long> bySeverity = new EnumMap<>(Severity.class);
        for (Severity s : Severity.values()) {
            bySeverity.put(s, active.stream().filter(a -> a.getSeverity() == s).count());
        }
        Map<RiskCategory, Long> byCategory = active.stream()
                .collect(Collectors.groupingBy(RiskAssessment::getCategory, () -> new EnumMap<>(RiskCategory.class),
                        Collectors.counting()));
        List<RiskView> top = active.stream()
                .sorted(Comparator.comparingInt(RiskAssessment::getScore).reversed()
                        .thenComparing(RiskAssessment::getFingerprint))
                .limit(5).map(a -> RiskView.of(a, json)).toList();
        int maxScore = active.stream().mapToInt(RiskAssessment::getScore).max().orElse(0);
        Severity overall = active.stream().map(RiskAssessment::getSeverity).max(Comparator.naturalOrder()).orElse(null);
        return new RiskSummaryView(projectId, overall, maxScore, active.size(), bySeverity, byCategory, top,
                projects.get(projectId).lastAnalyzedAt());
    }

    /** Stored explanation if it matches the current revision; otherwise a deterministic one built on the fly. */
    public ExplanationView explanationOf(RiskAssessment a) {
        if (a.getExplanationJson() != null && a.getExplanationRevision() != null
                && a.getExplanationRevision() == a.getRevision()) {
            return json.explanation(a.getExplanationJson());
        }
        return explanations.deterministic(a);
    }

    /** Used by the inbox to show live risk state next to delivered items. */
    public Map<UUID, RiskAssessment> byIds(List<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return assessments.findAllById(ids).stream().collect(Collectors.toMap(RiskAssessment::getId, Function.identity()));
    }

    /** Authorizes VIEW access to a risk's project (404 if invisible) and returns the project id. */
    public UUID requireVisibleProject(UUID actorId, UUID riskId) {
        return requireVisible(actorId, riskId).getProjectId();
    }

    private RiskAssessment requireVisible(UUID actorId, UUID riskId) {
        RiskAssessment a = assessments.findById(riskId).orElseThrow(() -> ApiException.notFound("Risk"));
        access.require(a.getProjectId(), actorId, Permission.VIEW);
        return a;
    }
}

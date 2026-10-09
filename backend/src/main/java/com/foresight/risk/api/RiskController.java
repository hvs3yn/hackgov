package com.foresight.risk.api;

import com.foresight.common.api.PageRequests;
import com.foresight.common.api.PageResponse;
import com.foresight.common.security.CurrentUser;
import com.foresight.risk.application.RiskAnalysisService;
import com.foresight.risk.application.RiskAnalysisService.AnalysisResult;
import com.foresight.risk.application.RiskQueryService;
import com.foresight.risk.application.RiskQueryService.RiskFilter;
import com.foresight.risk.application.RiskReconciler.Outcome;
import com.foresight.risk.application.RiskViews.RiskDetailView;
import com.foresight.risk.application.RiskViews.RiskEventView;
import com.foresight.risk.application.RiskViews.RiskSummaryView;
import com.foresight.risk.application.RiskViews.RiskView;
import com.foresight.risk.domain.RiskEnums.AssessmentStatus;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Risk analysis")
public class RiskController {

    private static final Map<String, String> RISK_SORTS = Map.of(
            "score", "score", "lastChangedAt", "lastChangedAt", "firstDetectedAt", "firstDetectedAt");
    private static final Map<String, String> HISTORY_SORTS = Map.of("occurredAt", "occurredAt");

    private final RiskQueryService queries;
    private final RiskAnalysisService analysis;

    public RiskController(RiskQueryService queries, RiskAnalysisService analysis) {
        this.queries = queries;
        this.analysis = analysis;
    }

    public record AnalysisResultResponse(UUID projectId, Instant analyzedAt, long dataVersion, int activeRisks,
                                         int detected, int escalated, int mitigated, int updated, int resolved,
                                         int reopened, int unchanged) {
        static AnalysisResultResponse of(AnalysisResult r) {
            return new AnalysisResultResponse(r.projectId(), r.analyzedAt(), r.dataVersion(), r.activeRisks(),
                    r.count(Outcome.DETECTED), r.count(Outcome.ESCALATED), r.count(Outcome.MITIGATED),
                    r.count(Outcome.UPDATED), r.count(Outcome.RESOLVED), r.count(Outcome.REOPENED),
                    r.count(Outcome.UNCHANGED));
        }
    }

    @GetMapping("/projects/{projectId}/risks")
    @Operation(summary = "Risks of a project (default: ACTIVE, highest score first)")
    public PageResponse<RiskView> list(@PathVariable UUID projectId,
                                       @RequestParam(required = false) List<AssessmentStatus> status,
                                       @RequestParam(required = false) List<Severity> severity,
                                       @RequestParam(required = false) List<RiskCategory> category,
                                       @RequestParam(required = false) UUID taskId,
                                       @RequestParam(required = false) Integer page,
                                       @RequestParam(required = false) Integer size,
                                       @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, RISK_SORTS,
                Sort.by(Sort.Order.desc("score"), Sort.Order.asc("fingerprint")));
        return PageResponse.of(queries.list(CurrentUser.id(), projectId,
                new RiskFilter(status, severity, category, taskId), pageable), v -> v);
    }

    @GetMapping("/risks/{riskId}")
    @Operation(summary = "Risk with factors, evidence, missing data, explanation and recommendations")
    public RiskDetailView get(@PathVariable UUID riskId) {
        return queries.detail(CurrentUser.id(), riskId);
    }

    @GetMapping("/risks/{riskId}/history")
    @Operation(summary = "Lifecycle events of a risk, newest first")
    public PageResponse<RiskEventView> history(@PathVariable UUID riskId,
                                               @RequestParam(required = false) Integer page,
                                               @RequestParam(required = false) Integer size,
                                               @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, HISTORY_SORTS, Sort.by("occurredAt").descending());
        return PageResponse.of(queries.history(CurrentUser.id(), riskId, pageable), v -> v);
    }

    @GetMapping("/tasks/{taskId}/risks")
    @Operation(summary = "Active risks whose subject is this task")
    public List<RiskView> taskRisks(@PathVariable UUID taskId) {
        return queries.activeForTask(CurrentUser.id(), taskId);
    }

    @GetMapping("/projects/{projectId}/risk-summary")
    public RiskSummaryView summary(@PathVariable UUID projectId) {
        return queries.summary(CurrentUser.id(), projectId);
    }

    @PostMapping("/projects/{projectId}/risk-analysis")
    @Operation(summary = "Run deterministic risk analysis now (LEAD, CONTRIBUTOR; cooldown applies)")
    public AnalysisResultResponse analyze(@PathVariable UUID projectId) {
        return AnalysisResultResponse.of(analysis.analyzeOnRequest(CurrentUser.id(), projectId));
    }
}

package com.foresight.recommendation.api;

import com.foresight.common.api.PageRequests;
import com.foresight.common.api.PageResponse;
import com.foresight.common.security.CurrentUser;
import com.foresight.recommendation.application.AiGenerationLog;
import com.foresight.recommendation.application.AiGenerationLog.AiGenerationView;
import com.foresight.risk.application.RiskQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Risk analysis")
public class AiGenerationController {

    private static final Map<String, String> SORTS = Map.of("createdAt", "createdAt");

    private final RiskQueryService risks;
    private final AiGenerationLog generationLog;

    public AiGenerationController(RiskQueryService risks, AiGenerationLog generationLog) {
        this.risks = risks;
        this.generationLog = generationLog;
    }

    @GetMapping("/risks/{riskId}/ai-generations")
    @Operation(summary = "How explanations for this risk were produced (provider, outcome, fallback reason, latency)")
    public PageResponse<AiGenerationView> list(@PathVariable UUID riskId,
                                               @RequestParam(required = false) Integer page,
                                               @RequestParam(required = false) Integer size,
                                               @RequestParam(required = false) List<String> sort) {
        risks.requireVisibleProject(CurrentUser.id(), riskId);
        var pageable = PageRequests.of(page, size, sort, SORTS, Sort.by("createdAt").descending());
        return PageResponse.of(generationLog.forAssessment(riskId, pageable), v -> v);
    }
}

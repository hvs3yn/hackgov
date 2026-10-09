package com.foresight.inbox.application;

import com.foresight.common.error.ApiException;
import com.foresight.common.json.JsonCodec;
import com.foresight.common.time.TimeProvider;
import com.foresight.inbox.domain.InboxItem;
import com.foresight.inbox.domain.InboxItem.Disposition;
import com.foresight.inbox.domain.InboxItemRepository;
import com.foresight.project.application.ProjectQueryApi;
import com.foresight.risk.application.RiskQueryService;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.domain.RiskAssessment;
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

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Inbox queries and state changes; every operation is scoped to the calling recipient. */
@Service
public class InboxService {

    private final InboxItemRepository items;
    private final RiskQueryService risks;
    private final ProjectQueryApi projects;
    private final TaskQueryApi tasks;
    private final JsonCodec json;
    private final TimeProvider time;

    public InboxService(InboxItemRepository items, RiskQueryService risks, ProjectQueryApi projects,
                        TaskQueryApi tasks, JsonCodec json, TimeProvider time) {
        this.items = items;
        this.risks = risks;
        this.projects = projects;
        this.tasks = tasks;
        this.json = json;
        this.time = time;
    }

    public record InboxFilter(Boolean read, List<Disposition> dispositions, List<Severity> severities,
                              List<RiskCategory> categories, UUID projectId, Instant from, Instant to) {
    }

    public record Links(String project, String task, String risk) {
    }

    public record InboxItemView(UUID id, UUID projectId, String projectName, UUID taskId, String taskTitle,
                                UUID riskId, AssessmentStatus riskStatus, Severity currentSeverity,
                                RiskCategory category, Severity severity, String title, ExplanationView explanation,
                                boolean read, Instant readAt, Disposition disposition, Instant dispositionAt,
                                int deliveredRevision, Instant createdAt, Instant lastDeliveredAt, Instant updatedAt,
                                Links links) {
    }

    @Transactional(readOnly = true)
    public Page<InboxItemView> list(UUID recipientId, InboxFilter filter, Pageable pageable) {
        Specification<InboxItem> spec = (root, q, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("recipientId"), recipientId));
            if (filter.read() != null) {
                p.add(filter.read() ? cb.isNotNull(root.get("readAt")) : cb.isNull(root.get("readAt")));
            }
            List<Disposition> dispositions = filter.dispositions() == null || filter.dispositions().isEmpty()
                    ? List.of(Disposition.OPEN, Disposition.ACKNOWLEDGED) : filter.dispositions();
            p.add(root.get("disposition").in(dispositions));
            if (filter.severities() != null && !filter.severities().isEmpty()) {
                p.add(root.get("severity").in(filter.severities()));
            }
            if (filter.categories() != null && !filter.categories().isEmpty()) {
                p.add(root.get("category").in(filter.categories()));
            }
            if (filter.projectId() != null) {
                p.add(cb.equal(root.get("projectId"), filter.projectId()));
            }
            if (filter.from() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("lastDeliveredAt"), filter.from()));
            }
            if (filter.to() != null) {
                p.add(cb.lessThanOrEqualTo(root.get("lastDeliveredAt"), filter.to()));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        Page<InboxItem> page = items.findAll(spec, pageable);
        List<InboxItem> content = page.getContent();
        Map<UUID, RiskAssessment> assessments = risks.byIds(content.stream().map(InboxItem::getAssessmentId).toList());
        Map<UUID, String> projectNames = projects.names(content.stream().map(InboxItem::getProjectId).toList());
        Map<UUID, String> taskTitles = tasks.titles(content.stream().map(InboxItem::getTaskId)
                .filter(Objects::nonNull).toList());
        return page.map(i -> view(i, assessments.get(i.getAssessmentId()), projectNames, taskTitles));
    }

    @Transactional(readOnly = true)
    public InboxItemView get(UUID recipientId, UUID itemId) {
        return view(require(recipientId, itemId));
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID recipientId) {
        return items.countByRecipientIdAndReadAtIsNullAndDispositionNot(recipientId, Disposition.DISMISSED);
    }

    @Transactional
    public InboxItemView markRead(UUID recipientId, UUID itemId) {
        InboxItem item = require(recipientId, itemId);
        item.markRead(time.now());
        return view(item);
    }

    @Transactional
    public InboxItemView markUnread(UUID recipientId, UUID itemId) {
        InboxItem item = require(recipientId, itemId);
        item.markUnread(time.now());
        return view(item);
    }

    @Transactional
    public InboxItemView dispose(UUID recipientId, UUID itemId, Disposition disposition) {
        InboxItem item = require(recipientId, itemId);
        item.dispose(disposition, time.now());
        return view(item);
    }

    private InboxItem require(UUID recipientId, UUID itemId) {
        return items.findByIdAndRecipientId(itemId, recipientId).orElseThrow(() -> ApiException.notFound("Inbox item"));
    }

    private InboxItemView view(InboxItem item) {
        Map<UUID, RiskAssessment> assessments = risks.byIds(List.of(item.getAssessmentId()));
        Map<UUID, String> projectNames = projects.names(List.of(item.getProjectId()));
        Map<UUID, String> taskTitles = item.getTaskId() == null ? Map.of() : tasks.titles(List.of(item.getTaskId()));
        return view(item, assessments.get(item.getAssessmentId()), projectNames, taskTitles);
    }

    private InboxItemView view(InboxItem i, RiskAssessment a, Map<UUID, String> projectNames,
                               Map<UUID, String> taskTitles) {
        ExplanationView explanation = json.read(i.getExplanationJson(), ExplanationView.class);
        Links links = new Links("/api/v1/projects/" + i.getProjectId(),
                i.getTaskId() == null ? null : "/api/v1/tasks/" + i.getTaskId(),
                "/api/v1/risks/" + i.getAssessmentId());
        return new InboxItemView(i.getId(), i.getProjectId(), projectNames.get(i.getProjectId()), i.getTaskId(),
                i.getTaskId() == null ? null : taskTitles.get(i.getTaskId()), i.getAssessmentId(),
                a == null ? null : a.getStatus(), a == null ? null : a.getSeverity(), i.getCategory(),
                i.getSeverity(), i.getTitle(), explanation, i.getReadAt() != null, i.getReadAt(), i.getDisposition(),
                i.getDispositionAt(), i.getAssessmentRevision(), i.getCreatedAt(), i.getLastDeliveredAt(),
                i.getUpdatedAt(), links);
    }
}

package com.foresight.inbox.api;

import com.foresight.common.api.PageRequests;
import com.foresight.common.api.PageResponse;
import com.foresight.common.security.CurrentUser;
import com.foresight.inbox.application.InboxService;
import com.foresight.inbox.application.InboxService.InboxFilter;
import com.foresight.inbox.application.InboxService.InboxItemView;
import com.foresight.inbox.domain.InboxItem.Disposition;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
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
@RequestMapping("/api/v1/inbox")
@Tag(name = "AI Inbox")
public class InboxController {

    private static final Map<String, String> SORTS = Map.of("lastDeliveredAt", "lastDeliveredAt", "createdAt", "createdAt");

    private final InboxService service;

    public InboxController(InboxService service) {
        this.service = service;
    }

    public record UnreadCount(long unread) {
    }

    @GetMapping
    @Operation(summary = "List the caller's inbox (default dispositions OPEN, ACKNOWLEDGED; newest first)")
    public PageResponse<InboxItemView> list(
            @RequestParam(required = false) Boolean read,
            @RequestParam(required = false) List<Disposition> disposition,
            @RequestParam(required = false) List<Severity> severity,
            @RequestParam(required = false) List<RiskCategory> category,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) List<String> sort) {
        var pageable = PageRequests.of(page, size, sort, SORTS, Sort.by("lastDeliveredAt").descending());
        var filter = new InboxFilter(read, disposition, severity, category, projectId, from, to);
        return PageResponse.of(service.list(CurrentUser.id(), filter, pageable), v -> v);
    }

    @GetMapping("/unread-count")
    public UnreadCount unreadCount() {
        return new UnreadCount(service.unreadCount(CurrentUser.id()));
    }

    @GetMapping("/{itemId}")
    public InboxItemView get(@PathVariable UUID itemId) {
        return service.get(CurrentUser.id(), itemId);
    }

    @PostMapping("/{itemId}/read")
    public InboxItemView read(@PathVariable UUID itemId) {
        return service.markRead(CurrentUser.id(), itemId);
    }

    @PostMapping("/{itemId}/unread")
    public InboxItemView unread(@PathVariable UUID itemId) {
        return service.markUnread(CurrentUser.id(), itemId);
    }

    @PostMapping("/{itemId}/acknowledge")
    @Operation(summary = "Acknowledge the recommendation (does not resolve the risk)")
    public InboxItemView acknowledge(@PathVariable UUID itemId) {
        return service.dispose(CurrentUser.id(), itemId, Disposition.ACKNOWLEDGED);
    }

    @PostMapping("/{itemId}/dismiss")
    @Operation(summary = "Dismiss the item; it resurfaces only if the risk escalates or reopens")
    public InboxItemView dismiss(@PathVariable UUID itemId) {
        return service.dispose(CurrentUser.id(), itemId, Disposition.DISMISSED);
    }
}

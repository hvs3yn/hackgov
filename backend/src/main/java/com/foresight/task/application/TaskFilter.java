package com.foresight.task.application;

import com.foresight.task.domain.Task;
import com.foresight.task.domain.TaskPriority;
import com.foresight.task.domain.TaskStatus;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Optional filters for listing tasks of a project.
 */
public record TaskFilter(List<TaskStatus> statuses, List<TaskPriority> priorities, UUID assigneeId,
                         Boolean unassigned, LocalDate dueFrom, LocalDate dueTo, Boolean overdue, String query) {

    Specification<Task> toSpecification(UUID projectId, LocalDate today) {
        return (root, cq, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("projectId"), projectId));
            predicates.add(cb.isNull(root.get("archivedAt")));
            if (statuses != null && !statuses.isEmpty()) {
                predicates.add(root.get("status").in(statuses));
            }
            if (priorities != null && !priorities.isEmpty()) {
                predicates.add(root.get("priority").in(priorities));
            }
            if (assigneeId != null) {
                predicates.add(cb.equal(root.get("assigneeId"), assigneeId));
            }
            if (Boolean.TRUE.equals(unassigned)) {
                predicates.add(cb.isNull(root.get("assigneeId")));
            }
            if (dueFrom != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dueDate"), dueFrom));
            }
            if (dueTo != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("dueDate"), dueTo));
            }
            if (Boolean.TRUE.equals(overdue)) {
                predicates.add(cb.lessThan(root.get("dueDate"), today));
                predicates.add(cb.not(root.get("status").in(EnumSet.of(TaskStatus.DONE, TaskStatus.CANCELLED))));
            }
            if (query != null && !query.isBlank()) {
                String escaped = query.trim().toLowerCase(Locale.ROOT)
                        .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
                predicates.add(cb.like(cb.lower(root.get("title")), "%" + escaped + "%", '\\'));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}

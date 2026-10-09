package com.foresight.recommendation.application;

import com.foresight.risk.engine.model.Confidence;
import com.foresight.risk.engine.model.RiskCategory;
import com.foresight.risk.engine.model.Severity;

import java.time.LocalDate;
import java.util.List;

/**
 * Minimal, structured summary of ONE assessment – the only data ever sent to an AI provider. Contains no ids,
 * credentials or data about unrelated users/projects.
 */
public record ExplanationRequest(String projectName, LocalDate projectDeadline, LocalDate today,
                                 RiskCategory category, Severity severity, int score, Confidence confidence,
                                 String title, List<FactorLine> factors, List<String> facts, List<String> inferences,
                                 List<String> missingData, TaskContext subjectTask, String subjectUserName,
                                 List<TaskContext> affectedTasks, List<TaskContext> prerequisites,
                                 List<String> possibleHelpers) {

    public ExplanationRequest {
        factors = List.copyOf(factors);
        facts = List.copyOf(facts);
        inferences = List.copyOf(inferences);
        missingData = List.copyOf(missingData);
        affectedTasks = List.copyOf(affectedTasks);
        prerequisites = List.copyOf(prerequisites);
        possibleHelpers = List.copyOf(possibleHelpers);
    }

    public record FactorLine(String description, int points) {
    }

    public record TaskContext(String title, String status, LocalDate dueDate, String assigneeName,
                              Integer progressPercentage) {
        public boolean unassigned() {
            return assigneeName == null;
        }
    }
}

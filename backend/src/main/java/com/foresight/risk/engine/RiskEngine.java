package com.foresight.risk.engine;

import com.foresight.risk.engine.model.ProjectSnapshot;
import com.foresight.risk.engine.model.RiskSignal;
import com.foresight.risk.engine.rules.ApproachingDeadlineRule;
import com.foresight.risk.engine.rules.BlockedDependencyRule;
import com.foresight.risk.engine.rules.OverdueTaskRule;
import com.foresight.risk.engine.rules.ProjectDeadlineRule;
import com.foresight.risk.engine.rules.StalledTaskRule;
import com.foresight.risk.engine.rules.WorkloadImbalanceRule;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Pure function: snapshot + time + settings → scored risk signals. No I/O, no framework dependencies.
 */
public final class RiskEngine {

    private final List<RiskRule> rules;
    private final RiskSettings settings;

    public RiskEngine(List<RiskRule> rules, RiskSettings settings) {
        this.rules = List.copyOf(rules);
        this.settings = settings;
    }

    public static RiskEngine withDefaultRules(RiskSettings settings) {
        return new RiskEngine(List.of(
                new OverdueTaskRule(),
                new ApproachingDeadlineRule(),
                new StalledTaskRule(),
                new BlockedDependencyRule(),
                new ProjectDeadlineRule(),
                new WorkloadImbalanceRule()), settings);
    }

    public List<RiskSignal> analyze(ProjectSnapshot snapshot, Instant now, ZoneId zone) {
        AnalysisContext context = new AnalysisContext(snapshot, now, zone, settings);
        List<RiskSignal> signals = new ArrayList<>();
        for (RiskRule rule : rules) {
            for (RiskSignal signal : rule.evaluate(context)) {
                if (signal.score() >= settings.minScore()) {
                    signals.add(signal);
                }
            }
        }
        signals.sort(Comparator.comparingInt(RiskSignal::score).reversed().thenComparing(RiskSignal::fingerprint));
        return signals;
    }
}

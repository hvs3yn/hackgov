package com.foresight.risk.application;

import com.foresight.risk.engine.RiskSettings;
import com.foresight.risk.engine.model.Severity;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.risk")
public record RiskProperties(
        @DefaultValue("true") boolean schedulingEnabled,
        @DefaultValue("PT15M") Duration analysisInterval,
        @DefaultValue("PT1M") Duration analysisInitialDelay,
        @DefaultValue("true") boolean onChangeEnabled,
        @DefaultValue("PT5S") Duration onChangeDebounce,
        @DefaultValue("PT10S") Duration manualCooldown,
        @DefaultValue("PT1M") Duration deliverySweepInterval,
        @DefaultValue("PT5M") Duration deliveryLease,
        @DefaultValue("5") int deliveryMaxAttempts,
        @DefaultValue("MEDIUM") Severity notifyMinSeverity,
        @DefaultValue("20") int minScore,
        @DefaultValue("6") double hoursPerDay,
        @DefaultValue("true") boolean excludeWeekends,
        @DefaultValue("3") int approachingDays,
        @DefaultValue("2") int urgentStallDays,
        @DefaultValue("5") int stallDays,
        @DefaultValue("10") int workloadHorizonDays,
        @DefaultValue("1.2") double workloadOverloadRatio,
        @DefaultValue("6") int workloadTaskCountThreshold) {

    public RiskSettings toSettings() {
        return new RiskSettings(minScore, hoursPerDay, excludeWeekends, approachingDays, urgentStallDays, stallDays,
                workloadHorizonDays, workloadOverloadRatio, workloadTaskCountThreshold);
    }
}

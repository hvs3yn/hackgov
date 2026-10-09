package com.foresight.risk.engine;

import com.foresight.risk.engine.model.Factor;
import com.foresight.risk.engine.model.Severity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ScoringPolicyTest {

    private final ScoringPolicy policy = new ScoringPolicy();

    @Test
    void scoreIsSumOfFactorPoints() {
        assertThat(policy.score(List.of(new Factor("A", "a", 30), new Factor("B", "b", 15), new Factor("C", "c", -5))))
                .isEqualTo(40);
    }

    @Test
    void scoreIsClampedToZeroAndHundred() {
        assertThat(policy.score(List.of(new Factor("A", "a", 80), new Factor("B", "b", 70)))).isEqualTo(100);
        assertThat(policy.score(List.of(new Factor("A", "a", -10)))).isZero();
        assertThat(policy.score(List.of())).isZero();
    }

    @ParameterizedTest
    @CsvSource({"0,LOW", "24,LOW", "25,MEDIUM", "49,MEDIUM", "50,HIGH", "74,HIGH", "75,CRITICAL", "100,CRITICAL"})
    void severityBandsFollowDocumentedBoundaries(int score, Severity expected) {
        assertThat(policy.severity(score)).isEqualTo(expected);
    }
}

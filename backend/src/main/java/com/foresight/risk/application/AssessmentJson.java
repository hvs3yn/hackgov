package com.foresight.risk.application;

import com.foresight.common.json.JsonCodec;
import com.foresight.risk.application.explanation.ExplanationView;
import com.foresight.risk.domain.RiskAssessment;
import com.foresight.risk.engine.model.Evidence;
import com.foresight.risk.engine.model.Factor;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;

import java.util.List;
import java.util.UUID;

/** Typed access to the JSON columns of {@link RiskAssessment}. */
@Component
public class AssessmentJson {

    private static final TypeReference<List<Factor>> FACTORS = new TypeReference<>() {
    };
    private static final TypeReference<List<Evidence>> EVIDENCE = new TypeReference<>() {
    };
    private static final TypeReference<List<UUID>> IDS = new TypeReference<>() {
    };
    private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {
    };

    private final JsonCodec json;

    public AssessmentJson(JsonCodec json) {
        this.json = json;
    }

    public List<Factor> factors(RiskAssessment a) {
        return json.read(a.getFactorsJson(), FACTORS);
    }

    public List<Evidence> evidence(RiskAssessment a) {
        return json.read(a.getEvidenceJson(), EVIDENCE);
    }

    public List<UUID> affectedTaskIds(RiskAssessment a) {
        return json.read(a.getAffectedTaskIdsJson(), IDS);
    }

    public List<String> missingData(RiskAssessment a) {
        return json.read(a.getMissingDataJson(), STRINGS);
    }

    public ExplanationView explanation(String explanationJson) {
        return json.read(explanationJson, ExplanationView.class);
    }

    public String write(Object value) {
        return json.write(value);
    }
}

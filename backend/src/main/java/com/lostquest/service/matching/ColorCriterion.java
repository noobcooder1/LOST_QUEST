package com.lostquest.service.matching;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/** Same color, compared on {@link MatchText#colorTokens} so "검정", "검정색" and 경찰청 "블랙(검정)" agree. */
@Component
@Order(3)
public class ColorCriterion implements MatchCriterion {

    public static final int MAX_POINTS = 20;

    @Override
    public String key() {
        return "color";
    }

    @Override
    public int maxPoints() {
        return MAX_POINTS;
    }

    @Override
    public CriterionResult evaluate(MatchTarget target, MatchCandidate candidate) {
        List<String> lost = MatchText.colorTokens(target.color());
        List<String> found = MatchText.colorTokens(candidate.color());
        if (lost.isEmpty() || found.isEmpty()) {
            return CriterionResult.unknown(MAX_POINTS, "색상 정보가 없습니다.");
        }
        if (lost.stream().anyMatch(found::contains)) {
            return CriterionResult.awarded(MAX_POINTS, MAX_POINTS, "같은 색상(" + candidate.color().strip() + ")");
        }
        return CriterionResult.mismatch(MAX_POINTS);
    }
}

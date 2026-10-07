package com.lostquest.service.matching;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Same item category. LOST QUEST categories are compared by name; for 경찰청 items the top-level class name
 * (e.g. "지갑" of "지갑 > 남성용 지갑") must equal the LOST QUEST category name. Names that differ (e.g. 기타 vs
 * 기타물품) are not forced to match.
 */
@Component
@Order(1)
public class CategoryCriterion implements MatchCriterion {

    public static final int MAX_POINTS = 35;

    @Override
    public String key() {
        return "category";
    }

    @Override
    public int maxPoints() {
        return MAX_POINTS;
    }

    @Override
    public CriterionResult evaluate(MatchTarget target, MatchCandidate candidate) {
        String lost = MatchText.normalize(target.category());
        String found = MatchText.normalize(candidate.category());
        if (lost == null || found == null) {
            return CriterionResult.unknown(MAX_POINTS, "분류 정보가 없습니다.");
        }
        if (lost.equals(found)) {
            return CriterionResult.awarded(MAX_POINTS, MAX_POINTS, "같은 분류(" + candidate.category().strip() + ")");
        }
        return CriterionResult.mismatch(MAX_POINTS);
    }
}

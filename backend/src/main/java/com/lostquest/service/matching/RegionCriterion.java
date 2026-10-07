package com.lostquest.service.matching;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Same province-level region. LOST QUEST found items carry the same short region names as lost items. 경찰청 found
 * items carry no region field: their region is known only when they were fetched with a region filter, and then
 * the official region name is compared with {@link MatchText#regionDenotes}. Otherwise the region is UNKNOWN.
 */
@Component
@Order(2)
public class RegionCriterion implements MatchCriterion {

    public static final int MAX_POINTS = 25;

    @Override
    public String key() {
        return "region";
    }

    @Override
    public int maxPoints() {
        return MAX_POINTS;
    }

    @Override
    public CriterionResult evaluate(MatchTarget target, MatchCandidate candidate) {
        if (MatchText.normalize(target.region()) == null || MatchText.normalize(candidate.region()) == null) {
            return CriterionResult.unknown(MAX_POINTS, candidate.source() == MatchSource.POLICE
                    ? "경찰청 습득물 목록은 지역 정보를 제공하지 않습니다."
                    : "지역 정보가 없습니다.");
        }
        if (MatchText.regionDenotes(candidate.region(), target.region())) {
            return CriterionResult.awarded(MAX_POINTS, MAX_POINTS, "같은 지역(" + candidate.region().strip() + ")");
        }
        return CriterionResult.mismatch(MAX_POINTS);
    }
}

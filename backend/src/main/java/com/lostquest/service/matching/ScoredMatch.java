package com.lostquest.service.matching;

import java.util.List;

/**
 * A candidate with its score. {@code score} is exactly the sum of the components' points and {@code reasons}
 * are exactly the reasons of the components that awarded points, in criterion order.
 */
public record ScoredMatch(MatchCandidate candidate, int score, int maxScore, List<Component> components,
                          List<String> reasons, Long daysAfterLoss) {

    public record Component(String key, CriterionResult result) {
    }
}

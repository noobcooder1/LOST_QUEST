package com.lostquest.service.matching;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Deterministic scoring: every criterion is evaluated independently, the score is the sum of their points, and
 * ties are broken by date distance (closer first, unknown last) and then by the stable candidate key.
 */
@Component
public class MatchingEngine {

    static final Comparator<ScoredMatch> ORDER = Comparator
            .comparingInt((ScoredMatch match) -> -match.score())
            .thenComparing(MatchingEngine::dateDistance, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing((ScoredMatch match) -> match.candidate().key());

    private final List<MatchCriterion> criteria;
    private final int maxScore;

    /** Spring injects the criteria in their {@code @Order}. */
    public MatchingEngine(List<MatchCriterion> criteria) {
        this.criteria = List.copyOf(criteria);
        this.maxScore = criteria.stream().mapToInt(MatchCriterion::maxPoints).sum();
    }

    public int maxScore() {
        return maxScore;
    }

    public ScoredMatch score(MatchTarget target, MatchCandidate candidate) {
        List<ScoredMatch.Component> components = new ArrayList<>(criteria.size());
        List<String> reasons = new ArrayList<>();
        int total = 0;
        for (MatchCriterion criterion : criteria) {
            CriterionResult result = criterion.evaluate(target, candidate);
            if (result.maxPoints() != criterion.maxPoints()) {
                throw new IllegalStateException("criterion " + criterion.key() + " reported a different maximum");
            }
            components.add(new ScoredMatch.Component(criterion.key(), result));
            total += result.points();
            if (result.reason() != null) {
                reasons.add(result.reason());
            }
        }
        return new ScoredMatch(candidate, total, maxScore, List.copyOf(components), List.copyOf(reasons),
                DateCriterion.daysAfterLoss(target.lostDate(), candidate.foundDate()));
    }

    /** Scores, drops candidates below {@code minScore}, de-duplicates by key, sorts and keeps at most {@code limit}. */
    public List<ScoredMatch> rank(MatchTarget target, List<MatchCandidate> candidates, int minScore, int limit) {
        Set<String> seen = new HashSet<>();
        return candidates.stream()
                .filter(Objects::nonNull)
                .map(candidate -> score(target, candidate))
                .filter(match -> match.score() >= minScore)
                .sorted(ORDER)
                .filter(match -> seen.add(match.candidate().key()))
                .limit(limit)
                .toList();
    }

    private static Long dateDistance(ScoredMatch match) {
        return match.daysAfterLoss() == null ? null : Math.abs(match.daysAfterLoss());
    }
}

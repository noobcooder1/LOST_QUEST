package com.lostquest.service.matching;

/**
 * The outcome of one criterion for one candidate. {@code reason} is set exactly when points were awarded, so the
 * reasons shown to users always match the score breakdown. {@code note} explains an UNKNOWN outcome.
 */
public record CriterionResult(int points, int maxPoints, Outcome outcome, String reason, String note) {

    public enum Outcome {
        /** Fully matched (all points). */
        MATCH,
        /** Partly matched (some points, e.g. a few days apart). */
        PARTIAL,
        /** Compared and did not match (0 points). */
        MISMATCH,
        /** Could not be compared because a value is missing or unusable (0 points). */
        UNKNOWN
    }

    public CriterionResult {
        if (points < 0 || points > maxPoints) {
            throw new IllegalArgumentException("points out of range");
        }
        if ((points > 0) != (reason != null)) {
            throw new IllegalArgumentException("a reason is required exactly when points are awarded");
        }
    }

    public static CriterionResult awarded(int points, int maxPoints, String reason) {
        return new CriterionResult(points, maxPoints, points == maxPoints ? Outcome.MATCH : Outcome.PARTIAL, reason, null);
    }

    public static CriterionResult mismatch(int maxPoints) {
        return new CriterionResult(0, maxPoints, Outcome.MISMATCH, null, null);
    }

    public static CriterionResult unknown(int maxPoints, String note) {
        return new CriterionResult(0, maxPoints, Outcome.UNKNOWN, null, note);
    }
}

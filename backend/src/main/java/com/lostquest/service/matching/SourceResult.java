package com.lostquest.service.matching;

import java.util.List;

/**
 * Candidates collected from one source and how the collection went. Sources are collected independently, so one
 * failing source never hides the other's candidates.
 *
 * @param message user-facing, key-free explanation for anything other than OK, otherwise null
 */
public record SourceResult(MatchSource source, Status status, List<MatchCandidate> candidates, String message) {

    public enum Status {
        /** Every lookup succeeded. */
        OK,
        /** Some lookups failed; the candidates are from the ones that succeeded. */
        PARTIAL,
        /** The source could not be searched; no candidates. */
        UNAVAILABLE,
        /** The source was not searched for this lost item (e.g. no usable date range). */
        SKIPPED
    }

    public SourceResult {
        candidates = List.copyOf(candidates);
    }

    public static SourceResult ok(MatchSource source, List<MatchCandidate> candidates) {
        return new SourceResult(source, Status.OK, candidates, null);
    }

    public static SourceResult unavailable(MatchSource source, String message) {
        return new SourceResult(source, Status.UNAVAILABLE, List.of(), message);
    }

    public static SourceResult skipped(MatchSource source, String message) {
        return new SourceResult(source, Status.SKIPPED, List.of(), message);
    }
}

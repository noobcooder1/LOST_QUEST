package com.lostquest.service.matching;

/**
 * One scoring component of the recommendation (category, region, color, date ...). Criteria are independent
 * Spring beans; adding a future component such as image similarity means adding one more implementation, not
 * changing the engine. Implementations must never throw for odd candidate data: return UNKNOWN instead.
 */
public interface MatchCriterion {

    /** Key used in the API score breakdown, e.g. "category". */
    String key();

    int maxPoints();

    CriterionResult evaluate(MatchTarget target, MatchCandidate candidate);
}

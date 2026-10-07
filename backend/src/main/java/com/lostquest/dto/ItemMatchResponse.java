package com.lostquest.dto;

import com.lostquest.service.matching.CriterionResult;
import com.lostquest.service.matching.MatchSource;
import com.lostquest.service.matching.MatchTarget;
import com.lostquest.service.matching.ScoredMatch;
import com.lostquest.service.matching.SourceResult;

import java.time.LocalDate;
import java.util.List;

/**
 * Found-item recommendations for one lost item. Scores are rule-based metadata scores (category, region, color,
 * date); {@code score} equals the sum of {@code scoreBreakdown} points and {@code reasons} list exactly the
 * components that awarded points.
 */
public record ItemMatchResponse(
        LostItemSummary lostItem,
        int maxScore,
        int minScore,
        int limit,
        List<Match> matches,
        List<Source> sources
) {

    public record LostItemSummary(Long id, String title, String category, String color, String region, LocalDate lostDate) {
    }

    /**
     * @param id           stable id across sources: "LOST_QUEST:{id}" or "POLICE:{atcId}-{fdSn}"
     * @param foundItemId  LOST QUEST found item id (LOST_QUEST only)
     * @param atcId        경찰청 관리번호 (POLICE only)
     * @param fdSn         경찰청 습득 순번 (POLICE only)
     * @param region       LOST_QUEST: registered region. POLICE: the 경찰청 region searched, or null when unknown.
     */
    public record Match(
            String id,
            MatchSource source,
            Long foundItemId,
            String atcId,
            Integer fdSn,
            String title,
            String category,
            String color,
            LocalDate foundDate,
            String region,
            String location,
            String storagePlace,
            String imageUrl,
            int score,
            int maxScore,
            List<ScoreComponent> scoreBreakdown,
            List<String> reasons
    ) {
    }

    /** {@code note} explains an UNKNOWN result (e.g. the source has no region information). */
    public record ScoreComponent(String key, int points, int maxPoints, CriterionResult.Outcome result, String note) {
    }

    public record Source(MatchSource source, SourceResult.Status status, int candidateCount, String message) {
    }

    public static ItemMatchResponse of(MatchTarget target, int maxScore, int minScore, int limit,
                                       List<ScoredMatch> matches, List<SourceResult> sources) {
        return new ItemMatchResponse(
                new LostItemSummary(target.lostItemId(), target.title(), target.category(), target.color(),
                        target.region(), target.lostDate()),
                maxScore,
                minScore,
                limit,
                matches.stream().map(ItemMatchResponse::toMatch).toList(),
                sources.stream().map(source -> new Source(source.source(), source.status(),
                        source.candidates().size(), source.message())).toList());
    }

    private static Match toMatch(ScoredMatch match) {
        var c = match.candidate();
        return new Match(c.key(), c.source(), c.foundItemId(), c.atcId(), c.fdSn(), c.title(), c.category(), c.color(),
                c.foundDate(), c.region(), c.location(), c.storagePlace(), c.imageUrl(), match.score(), match.maxScore(),
                match.components().stream().map(component -> new ScoreComponent(component.key(),
                        component.result().points(), component.result().maxPoints(), component.result().outcome(),
                        component.result().note())).toList(),
                match.reasons());
    }
}

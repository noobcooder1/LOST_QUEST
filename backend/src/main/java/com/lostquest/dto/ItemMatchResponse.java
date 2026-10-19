package com.lostquest.dto;

import com.lostquest.service.matching.CriterionResult;
import com.lostquest.service.matching.ItemKind;
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

    /** @param nameKind the item kind read from the title (e.g. "우산"), or null when it cannot be told. */
    public record LostItemSummary(Long id, String title, String category, String color, String region, LocalDate lostDate, String description,
                                  String nameKind) {
    }

    /**
     * @param id           stable id across sources: "LOST_QUEST:{id}" or "POLICE:{atcId}-{fdSn}"
     * @param foundItemId  LOST QUEST found item id (LOST_QUEST only)
     * @param atcId        경찰청 관리번호 (POLICE only)
     * @param fdSn         경찰청 습득 순번 (POLICE only)
     * @param region       LOST_QUEST: registered region. POLICE: the 경찰청 region searched, or null when unknown.
     * @param nameMatch    display hint only: SAME_KIND or UNKNOWN_KIND by the titles' item kinds; null when the lost
     *                     item's own kind is unknown. It is not part of {@code score}.
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
            List<String> reasons,
            String description,
            String nameMatch
    ) {
    }

    /** {@code note} explains an UNKNOWN result (e.g. the source has no region information). */
    public record ScoreComponent(String key, int points, int maxPoints, CriterionResult.Outcome result, String note) {
    }

    public record Source(MatchSource source, SourceResult.Status status, int candidateCount, String message) {
    }

    public static ItemMatchResponse of(MatchTarget target, int maxScore, int minScore, int limit,
                                       List<ScoredMatch> matches, List<SourceResult> sources) {
        String targetKind = ItemKind.of(target.title(), target.category());
        return new ItemMatchResponse(
                new LostItemSummary(target.lostItemId(), target.title(), target.category(), target.color(),
                        target.region(), target.lostDate(), target.description(), ItemKind.label(targetKind)),
                maxScore,
                minScore,
                limit,
                matches.stream().map(match -> toMatch(match, targetKind)).toList(),
                sources.stream().map(source -> new Source(source.source(), source.status(),
                        source.candidates().size(), source.message())).toList());
    }

    private static Match toMatch(ScoredMatch match, String targetKind) {
        var c = match.candidate();
        String candidateKind = ItemKind.of(c.title(), c.category());
        String nameMatch = targetKind == null ? null
                : candidateKind == null ? "UNKNOWN_KIND" : targetKind.equals(candidateKind) ? "SAME_KIND" : "DIFFERENT_KIND";
        return new Match(c.key(), c.source(), c.foundItemId(), c.atcId(), c.fdSn(), c.title(), c.category(), c.color(),
                c.foundDate(), c.region(), c.location(), c.storagePlace(), c.imageUrl(), match.score(), match.maxScore(),
                match.components().stream().map(component -> new ScoreComponent(component.key(),
                        component.result().points(), component.result().maxPoints(), component.result().outcome(),
                        component.result().note())).toList(),
                match.reasons(), c.description(), nameMatch);
    }
}

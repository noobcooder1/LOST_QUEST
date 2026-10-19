package com.lostquest.service.matching;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.time.LocalDate;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class ItemKindTest {
    @ParameterizedTest @CsvSource({
        "검은색 3단 우산,기타,umbrella","블랙 접이식 우산,기타물품,umbrella","black folding umbrella,기타,umbrella",
        "검정 후드집업,기타,clothes","black hoodie,의류,clothes","노트북,전자기기,laptop","노트,기타,book",
        "무선 이어폰,전자기기,earbuds","에어팟 케이스,기타,earbuds","검은 반지갑,기타,wallet","남색 백팩,가방,bag",
        "검정 낚시대,기타물품,fishing","카본 낚싯대,스포츠용품,fishing","낚시가방,기타,fishing","골프채 드라이버,스포츠용품,golf"})
    void recognizesConcreteKindsInTitles(String title,String category,String expected){assertThat(ItemKind.of(title,category)).isEqualTo(expected);}
    @Test void keepsAmbiguousTitlesAndGeneralCategoriesUnknown(){
        assertThat(ItemKind.of("우산이 든 가방","기타")).isNull();
        assertThat(ItemKind.of("검은 물품","기타")).isNull();
        assertThat(ItemKind.of("물건","전자기기")).isNull();
    }
    private final LocalDate date = LocalDate.of(2026, 10, 10);
    private final MatchingEngine engine = new MatchingEngine(List.of(new CategoryCriterion(), new RegionCriterion(), new ColorCriterion(), new DateCriterion()));
    private MatchCandidate item(long id, String title, String category) {
        return new MatchCandidate(MatchSource.LOST_QUEST, "LOST_QUEST:" + id, id, null, null, title, category, "검정", date, "서울", "역", null, null);
    }

    @Test void recommendationListPutsTheSameNamedKindFirstWithoutChangingScores() {
        var target = new MatchTarget(1L, "검은색 우산", "기타", "검정", "서울", date);
        var hoodie = item(1, "검은 후드집업", "기타");      // 100 points: same "기타" category
        var umbrella = item(2, "블랙 3단 우산", "우산");     // 65 points: category text differs
        var unknown = item(3, "검정 물품", "기타");          // 100 points, kind unknown
        var candidates = List.of(hoodie, umbrella, unknown);

        // The hoodie is a clearly different kind, so it is left out of the recommendation list.
        assertThat(engine.rankNameFirst(target, candidates, 40, 10)).extracting(m -> m.candidate().key())
                .containsExactly("LOST_QUEST:2", "LOST_QUEST:3");
        // Score order (used by notifications) and the scores themselves stay exactly as before.
        assertThat(engine.rank(target, candidates, 40, 10)).extracting(m -> m.candidate().key())
                .containsExactly("LOST_QUEST:1", "LOST_QUEST:3", "LOST_QUEST:2");
        assertThat(engine.rankNameFirst(target, candidates, 40, 10)).extracting(ScoredMatch::score).containsExactly(65, 100);
        assertThat(engine.rankNameFirst(target, List.of(item(4, "검정 낚시대", "기타"), unknown), 40, 10)).extracting(m -> m.candidate().key())
                .containsExactly("LOST_QUEST:3");
    }

    @Test void nameFirstKeepsTheScoreFloorAndLimitAndFallsBackToScoreOrderForUnknownTitles() {
        var umbrellaTarget = new MatchTarget(1L, "검은색 우산", "기타", "검정", "서울", date);
        var lowUmbrella = new MatchCandidate(MatchSource.LOST_QUEST, "LOST_QUEST:9", 9L, null, null, "우산", "우산", "흰색", date.plusDays(40), "부산", "역", null, null);
        assertThat(engine.rankNameFirst(umbrellaTarget, List.of(lowUmbrella), 40, 10)).isEmpty();
        assertThat(engine.rankNameFirst(umbrellaTarget, List.of(item(1, "검은 우산", "기타"), item(2, "블랙 우산", "기타")), 40, 1)).hasSize(1);

        var vague = new MatchTarget(1L, "검은 물건", "기타", "검정", "서울", date);
        var candidates = List.of(item(1, "검은 후드집업", "기타"), item(2, "블랙 3단 우산", "우산"));
        assertThat(engine.rankNameFirst(vague, candidates, 40, 10)).isEqualTo(engine.rank(vague, candidates, 40, 10));
    }
}

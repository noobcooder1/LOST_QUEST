package com.lostquest.service.matching;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static com.lostquest.service.matching.MatchingCriteriaTest.lq;
import static com.lostquest.service.matching.MatchingCriteriaTest.police;
import static com.lostquest.service.matching.MatchingCriteriaTest.target;
import static org.assertj.core.api.Assertions.assertThat;

class MatchingEngineTest {

    private static final LocalDate LOST = LocalDate.of(2026, 9, 10);
    private final MatchingEngine engine = new MatchingEngine(
            List.of(new CategoryCriterion(), new RegionCriterion(), new ColorCriterion(), new DateCriterion()));
    private final MatchTarget wallet = target("지갑", "검정", "서울", LOST);

    @Test
    @DisplayName("점수 = 항목 점수 합, 이유 = 점수를 받은 항목만 (순서 동일)")
    void scoreEqualsBreakdownAndReasons() {
        ScoredMatch match = engine.score(wallet, police("A", 1, "지갑", "블랙(검정)", null, LOST.plusDays(2)));

        assertThat(match.score()).isEqualTo(35 + 0 + 20 + 18);
        assertThat(match.score()).isEqualTo(match.components().stream().mapToInt(c -> c.result().points()).sum());
        assertThat(match.components()).extracting(ScoredMatch.Component::key).containsExactly("category", "region", "color", "date");
        assertThat(match.reasons()).containsExactly("같은 분류(지갑)", "같은 색상(블랙(검정))", "분실 2일 후 습득");
        assertThat(match.reasons()).hasSize((int) match.components().stream().filter(c -> c.result().points() > 0).count());
        assertThat(match.components().get(1).result().outcome()).isEqualTo(CriterionResult.Outcome.UNKNOWN);
        assertThat(match.maxScore()).isEqualTo(100);
    }

    @Test
    @DisplayName("완전 일치 100점, 전혀 다르면 0점")
    void boundaries() {
        assertThat(engine.score(wallet, lq(1, "지갑", "검정색", "서울", LOST)).score()).isEqualTo(100);
        assertThat(engine.score(wallet, lq(2, "가방", "흰색", "부산", LOST.minusDays(1))).score()).isZero();
        assertThat(engine.score(wallet, lq(2, "가방", "흰색", "부산", LOST.minusDays(1))).reasons()).isEmpty();
    }

    @Test
    @DisplayName("정렬: 점수 내림차순 → 날짜 차이 오름차순 → 날짜 미상 뒤 → 안정 ID 오름차순, 입력 순서와 무관")
    void deterministicOrder() {
        List<MatchCandidate> candidates = new ArrayList<>(List.of(
                lq(9, "지갑", "검정", "서울", LOST),                         // 100
                lq(3, "지갑", "검정", "서울", LOST.plusDays(1)),             // 98, 1 day
                lq(2, "지갑", "검정", "서울", LOST.plusDays(3)),             // 98, 3 days
                lq(1, "지갑", "검정", "서울", LOST.plusDays(3)),             // 98, 3 days → id 1 before 2
                police("B", 1, "지갑", "블랙(검정)", "서울특별시", LOST.plusDays(1)), // 98, 1 day → key POLICE after LOST_QUEST:3
                police("C", 1, "지갑", "블랙(검정)", "서울특별시", null)       // 80, unknown date
        ));
        List<String> expected = List.of("LOST_QUEST:9", "LOST_QUEST:3", "POLICE:B-1", "LOST_QUEST:1", "LOST_QUEST:2", "POLICE:C-1");
        for (int i = 0; i < 5; i++) {
            Collections.shuffle(candidates, new java.util.Random(i));
            assertThat(engine.rank(wallet, candidates, 0, 20)).extracting(m -> m.candidate().key()).containsExactlyElementsOf(expected);
        }
    }

    @Test
    @DisplayName("최소 점수 미만 제외, limit 적용, 같은 key 중복 제거")
    void thresholdLimitAndDedupe() {
        List<MatchCandidate> candidates = List.of(
                lq(1, "지갑", null, null, LOST.plusDays(20)),                // 35 < 40
                lq(2, "지갑", null, null, LOST.plusDays(10)),                // 41
                lq(3, "지갑", "검정", "서울", LOST),                          // 100
                lq(3, "지갑", "검정", "서울", LOST),                          // duplicate key
                lq(4, "가방", "검정", "서울", LOST));                         // 65
        List<ScoredMatch> ranked = engine.rank(wallet, candidates, 40, 20);
        assertThat(ranked).extracting(m -> m.candidate().key()).containsExactly("LOST_QUEST:3", "LOST_QUEST:4", "LOST_QUEST:2");
        assertThat(engine.rank(wallet, candidates, 40, 2)).hasSize(2);
        assertThat(engine.rank(wallet, List.of(), 40, 10)).isEmpty();
    }

    @Test
    @DisplayName("새 점수 항목(예: 이미지)은 기준 추가만으로 합산된다")
    void extensibleWithNewCriterion() {
        MatchCriterion extra = new MatchCriterion() {
            public String key() { return "extra"; }
            public int maxPoints() { return 10; }
            public CriterionResult evaluate(MatchTarget t, MatchCandidate c) { return CriterionResult.unknown(10, "아직 계산하지 않음"); }
        };
        MatchingEngine extended = new MatchingEngine(List.of(new CategoryCriterion(), extra));
        ScoredMatch match = extended.score(wallet, lq(1, "지갑", null, null, LOST));
        assertThat(extended.maxScore()).isEqualTo(45);
        assertThat(match.score()).isEqualTo(35);
        assertThat(match.components()).extracting(ScoredMatch.Component::key).containsExactly("category", "extra");
    }
}

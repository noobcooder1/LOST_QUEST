package com.lostquest.service.matching;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MatchingCriteriaTest {

    private static final LocalDate LOST = LocalDate.of(2026, 9, 10);

    private final CategoryCriterion category = new CategoryCriterion();
    private final RegionCriterion region = new RegionCriterion();
    private final ColorCriterion color = new ColorCriterion();
    private final DateCriterion date = new DateCriterion();

    static MatchTarget target(String category, String color, String region, LocalDate lostDate) {
        return new MatchTarget(1L, "검은색 지갑", category, color, region, lostDate);
    }

    static MatchCandidate lq(long id, String category, String color, String region, LocalDate foundDate) {
        return new MatchCandidate(MatchSource.LOST_QUEST, "LOST_QUEST:" + id, id, null, null, "습득물 " + id,
                category, color, foundDate, region, "장소", null, null);
    }

    static MatchCandidate police(String atcId, int fdSn, String category, String color, String region, LocalDate foundDate) {
        return new MatchCandidate(MatchSource.POLICE, "POLICE:" + atcId + "-" + fdSn, null, atcId, fdSn, "경찰청 " + atcId,
                category, color, foundDate, region, null, "보관장소", null);
    }

    @Test
    @DisplayName("점수 배분: 분류 35 + 지역 25 + 색상 20 + 날짜 20 = 100")
    void maxPointsAddUpTo100() {
        assertThat(category.maxPoints() + region.maxPoints() + color.maxPoints() + date.maxPoints()).isEqualTo(100);
        assertThat(new MatchingEngine(List.of(category, region, color, date)).maxScore()).isEqualTo(100);
    }

    @Test
    @DisplayName("분류: 같은 이름 MATCH 35점, 다른 이름 MISMATCH 0점, 없으면 UNKNOWN 0점")
    void category() {
        MatchTarget wallet = target("지갑", "검정", "서울", LOST);
        CriterionResult same = category.evaluate(wallet, police("A", 1, "지갑", null, null, LOST));
        assertThat(same.points()).isEqualTo(35);
        assertThat(same.outcome()).isEqualTo(CriterionResult.Outcome.MATCH);
        assertThat(same.reason()).isEqualTo("같은 분류(지갑)");

        CriterionResult different = category.evaluate(wallet, lq(1, "가방", null, null, LOST));
        assertThat(different.points()).isZero();
        assertThat(different.outcome()).isEqualTo(CriterionResult.Outcome.MISMATCH);
        assertThat(different.reason()).isNull();

        // Names are not forced together: LOST QUEST 기타 is not 경찰청 기타물품.
        assertThat(category.evaluate(target("기타", null, null, LOST), police("A", 1, "기타물품", null, null, LOST)).points()).isZero();

        CriterionResult missing = category.evaluate(wallet, police("A", 1, null, null, null, LOST));
        assertThat(missing.outcome()).isEqualTo(CriterionResult.Outcome.UNKNOWN);
        assertThat(missing.points()).isZero();
        assertThat(missing.reason()).isNull();
    }

    @ParameterizedTest(name = "{0} denotes {1}")
    @CsvSource({
            "서울특별시,서울", "경기도,경기", "부산광역시,부산", "인천광역시,인천", "대구광역시,대구", "대전광역시,대전",
            "광주광역시,광주", "전남광주통합특별시,광주", "전남광주통합특별시,전남", "전라남도,전남", "울산광역시,울산",
            "세종특별자치시,세종", "강원도,강원", "충청북도,충북", "충청남도,충남", "전라북도,전북", "경상북도,경북",
            "경상남도,경남", "제주특별자치도,제주", "서울,서울"
    })
    void regionRuleMatchesOfficialNames(String official, String shortName) {
        assertThat(MatchText.regionDenotes(official, shortName)).isTrue();
    }

    @ParameterizedTest(name = "{0} does not denote {1}")
    @CsvSource({"서울특별시,경기", "충청북도,충남", "경상남도,전남", "전라북도,전남", "광주광역시,전남", "기타,서울", "해외,서울"})
    void regionRuleRejectsOtherRegions(String official, String shortName) {
        assertThat(MatchText.regionDenotes(official, shortName)).isFalse();
    }

    @Test
    @DisplayName("지역: LOST QUEST끼리 같은 지역 25점, 경찰청 지역 미상은 UNKNOWN (일치로 표시하지 않음)")
    void region() {
        MatchTarget seoul = target("지갑", "검정", "서울", LOST);
        assertThat(region.evaluate(seoul, lq(1, "지갑", null, "서울", LOST)).points()).isEqualTo(25);
        assertThat(region.evaluate(seoul, lq(1, "지갑", null, "경기", LOST)).outcome()).isEqualTo(CriterionResult.Outcome.MISMATCH);

        CriterionResult searched = region.evaluate(seoul, police("A", 1, "지갑", null, "서울특별시", LOST));
        assertThat(searched.points()).isEqualTo(25);
        assertThat(searched.reason()).isEqualTo("같은 지역(서울특별시)");

        CriterionResult unknown = region.evaluate(seoul, police("A", 1, "지갑", null, null, LOST));
        assertThat(unknown.outcome()).isEqualTo(CriterionResult.Outcome.UNKNOWN);
        assertThat(unknown.points()).isZero();
        assertThat(unknown.reason()).isNull();
        assertThat(unknown.note()).contains("지역 정보를 제공하지 않습니다");

        assertThat(region.evaluate(target("지갑", "검정", null, LOST), lq(1, "지갑", null, "서울", LOST)).outcome())
                .isEqualTo(CriterionResult.Outcome.UNKNOWN);
    }

    @ParameterizedTest(name = "{0} = {1}")
    @CsvSource({"검정,블랙(검정)", "검정색,블랙(검정)", "블랙,블랙(검정)", "갈색,브라운(갈)", "흰색,화이트(흰)", "회색,그레이(회)",
            "파랑,블루(파랑)", "빨강,레드(빨강)", "초록,그린(초록)", "검정,검정", "검 정,검정색"})
    void colorMatches(String lostColor, String foundColor) {
        CriterionResult result = color.evaluate(target("지갑", lostColor, "서울", LOST), police("A", 1, "지갑", foundColor, null, LOST));
        assertThat(result.points()).isEqualTo(20);
        assertThat(result.reason()).isEqualTo("같은 색상(" + foundColor + ")");
    }

    @ParameterizedTest(name = "{0} != {1}")
    @CsvSource({"검정,화이트(흰)", "파랑,블루(어두운파랑)", "회색,그레이(암회)", "빨강,다크레드(진빨강)", "검정,기타"})
    void colorMismatches(String lostColor, String foundColor) {
        CriterionResult result = color.evaluate(target("지갑", lostColor, "서울", LOST), police("A", 1, "지갑", foundColor, null, LOST));
        assertThat(result.points()).isZero();
        assertThat(result.outcome()).isEqualTo(CriterionResult.Outcome.MISMATCH);
    }

    @Test
    @DisplayName("색상 없음은 UNKNOWN")
    void colorUnknown() {
        assertThat(color.evaluate(target("지갑", "검정", "서울", LOST), lq(1, "지갑", null, "서울", LOST)).outcome())
                .isEqualTo(CriterionResult.Outcome.UNKNOWN);
        assertThat(color.evaluate(target("지갑", "  ", "서울", LOST), lq(1, "지갑", "검정", "서울", LOST)).outcome())
                .isEqualTo(CriterionResult.Outcome.UNKNOWN);
    }

    @ParameterizedTest(name = "found {0} days after loss = {1} points")
    @CsvSource({"0,20", "1,18", "3,18", "4,12", "7,12", "8,6", "14,6", "15,0", "40,0", "-1,0", "-30,0"})
    void datePolicy(int days, int points) {
        CriterionResult result = date.evaluate(target("지갑", "검정", "서울", LOST), lq(1, "지갑", "검정", "서울", LOST.plusDays(days)));
        assertThat(result.points()).isEqualTo(points);
        if (points == 0) {
            assertThat(result.outcome()).isEqualTo(CriterionResult.Outcome.MISMATCH);
            assertThat(result.reason()).isNull();
        } else {
            assertThat(result.reason()).isEqualTo(days == 0 ? "분실 당일 습득" : "분실 " + days + "일 후 습득");
        }
    }

    @Test
    @DisplayName("날짜 없음은 해당 항목만 UNKNOWN (전체 실패 아님)")
    void dateUnknown() {
        CriterionResult result = date.evaluate(target("지갑", "검정", "서울", LOST), police("A", 1, "지갑", "블랙(검정)", null, null));
        assertThat(result.outcome()).isEqualTo(CriterionResult.Outcome.UNKNOWN);
        assertThat(result.points()).isZero();
        assertThat(date.evaluate(target("지갑", "검정", "서울", null), lq(1, "지갑", "검정", "서울", LOST)).outcome())
                .isEqualTo(CriterionResult.Outcome.UNKNOWN);
    }

    @Test
    @DisplayName("CriterionResult: 점수가 있을 때만 이유가 있어야 하고 범위를 넘을 수 없다")
    void resultInvariant() {
        assertThatThrownBy(() -> new CriterionResult(10, 20, CriterionResult.Outcome.PARTIAL, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CriterionResult(0, 20, CriterionResult.Outcome.MISMATCH, "이유", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CriterionResult(21, 20, CriterionResult.Outcome.MATCH, "이유", null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

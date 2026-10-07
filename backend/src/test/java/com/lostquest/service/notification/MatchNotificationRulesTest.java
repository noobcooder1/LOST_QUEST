package com.lostquest.service.notification;

import com.lostquest.service.matching.MatchCandidate;
import com.lostquest.service.matching.MatchSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** Validation of candidate ids and titles before anything external is stored. */
class MatchNotificationRulesTest {

    private static MatchCandidate lq(Long id, String key) {
        return new MatchCandidate(MatchSource.LOST_QUEST, key, id, null, null, "지갑", "지갑", "검정", LocalDate.now(), "서울", null, null, null);
    }

    private static MatchCandidate police(String atcId, Integer fdSn, String key) {
        return new MatchCandidate(MatchSource.POLICE, key, null, atcId, fdSn, "지갑", "지갑", "블랙(검정)", LocalDate.now(), null, null, "경찰서", null);
    }

    @Test
    @DisplayName("LOST QUEST 후보: 양수 id와 일치하는 key만 저장 대상")
    void lostQuestIds() {
        assertThat(MatchNotificationService.isTrustworthy(lq(12L, "LOST_QUEST:12"))).isTrue();
        assertThat(MatchNotificationService.isTrustworthy(lq(12L, "LOST_QUEST:13"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(lq(0L, "LOST_QUEST:0"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(lq(null, "LOST_QUEST:null"))).isFalse();
    }

    @Test
    @DisplayName("경찰청 후보: 확인된 관리번호 형식(F+16자리)·순번 1~999·일치하는 key만 저장 대상")
    void policeIds() {
        assertThat(MatchNotificationService.isTrustworthy(police("F2026100600004521", 1, "POLICE:F2026100600004521-1"))).isTrue();
        assertThat(MatchNotificationService.isTrustworthy(police("F2026100600004521", 999, "POLICE:F2026100600004521-999"))).isTrue();
        assertThat(MatchNotificationService.isTrustworthy(police("../../etc/passwd", 1, "POLICE:../../etc/passwd-1"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(police("L2026100600004521", 1, "POLICE:L2026100600004521-1"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(police("F202610060000452", 1, "POLICE:F202610060000452-1"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(police("F2026100600004521<script>", 1, "POLICE:F2026100600004521<script>-1"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(police("F2026100600004521", 0, "POLICE:F2026100600004521-0"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(police("F2026100600004521", 1000, "POLICE:F2026100600004521-1000"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(police("F2026100600004521", null, "POLICE:F2026100600004521-null"))).isFalse();
        assertThat(MatchNotificationService.isTrustworthy(police("F2026100600004521", 1, "POLICE:F2026100600009999-1"))).isFalse();
    }

    @Test
    @DisplayName("제목: 제어문자 제거, 공백만 있으면 null, 120자로 자름")
    void titles() {
        assertThat(MatchNotificationService.cleanTitle(" 검정\n지갑\t ")).isEqualTo("검정 지갑");
        assertThat(MatchNotificationService.cleanTitle("\u0000 \u0007")).isNull();
        assertThat(MatchNotificationService.cleanTitle(null)).isNull();
        assertThat(MatchNotificationService.cleanTitle("가".repeat(300))).hasSize(120);
    }
}

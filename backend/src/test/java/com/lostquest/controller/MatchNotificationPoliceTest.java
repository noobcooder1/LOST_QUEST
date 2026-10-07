package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.MatchNotificationRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.matching.MatchCandidate;
import com.lostquest.service.matching.MatchSource;
import com.lostquest.service.matching.MatchTarget;
import com.lostquest.service.matching.PoliceCandidateCollector;
import com.lostquest.service.matching.SourceResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 경찰청 candidates through refresh (police API replaced by a fake collector; default 10-minute throttle).
 * The fake returns PARTIAL with a valid strong candidate, a weak one, and ids that must never be stored.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MatchNotificationPoliceTest {

    private static final LocalDate LOST = LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(5);
    static final AtomicInteger POLICE_CALLS = new AtomicInteger();

    @TestConfiguration
    static class FakePoliceConfig {
        @Bean
        @Primary
        PoliceCandidateCollector fakePoliceCandidateCollector() {
            return new PoliceCandidateCollector(null, null) {
                @Override
                public SourceResult collect(MatchTarget target) {
                    POLICE_CALLS.incrementAndGet();
                    return new SourceResult(MatchSource.POLICE, SourceResult.Status.PARTIAL, List.of(
                            police("F2026100600004521", 1, "검정 반지갑", "서울특별시", LOST.plusDays(1)),     // 98
                            police("F2026100600004522", 2, "지갑", null, LOST.plusDays(9)),                  // 35+20+6 = 61
                            police("../../admin", 1, "조작된 관리번호", "서울특별시", LOST),                    // invalid id
                            new MatchCandidate(MatchSource.POLICE, "POLICE:F2026100600009999-1", null, "F2026100600001111", 1,
                                    "key 불일치", "지갑", "블랙(검정)", LOST, "서울특별시", null, "경찰서", null)),
                            "경찰청 습득물 일부 조회에 실패해 조회된 결과만 표시합니다.");
                }
            };
        }

        static MatchCandidate police(String atcId, int fdSn, String title, String region, LocalDate date) {
            return new MatchCandidate(MatchSource.POLICE, "POLICE:" + atcId + "-" + fdSn, null, atcId, fdSn, title, "지갑",
                    "블랙(검정)", date, region, null, "성동경찰서", null);
        }
    }

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private LostItemRepository lostItemRepository;
    @Autowired
    private FoundItemRepository foundItemRepository;
    @Autowired
    private MatchNotificationRepository notificationRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private String token;

    @BeforeEach
    void setUp() {
        cleanUp();
        POLICE_CALLS.set(0);
        User owner = userRepository.save(new User("police-owner@lostquest.test", passwordEncoder.encode("Quest1234!"), "주인", UserRole.USER));
        token = jwtTokenProvider.issueAccessToken(owner).value();
        lostItemRepository.saveAndFlush(new LostItem(owner, "검정 지갑", "지갑", "검정",
                "카드 두 장이 들어 있는 검은색 반지갑입니다.", LOST, "서울", "서울숲역 3번 출구", null, LostItemStatus.LOST));
    }

    @AfterEach
    void cleanUp() {
        notificationRepository.deleteAll();
        foundItemRepository.deleteAll();
        lostItemRepository.deleteAll();
        userRepository.deleteAll();
    }

    private JsonNode call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        String body = mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(body);
    }

    @Test
    @DisplayName("경찰청 후보: 기준 이상·검증된 ID만 알림, 부분 장애는 PARTIAL로 표시, 갱신 간격 내 재요청은 경찰청 미호출")
    void policeCandidatesNotifyOnceAndAreThrottled() throws Exception {
        JsonNode refresh = call(post("/api/notifications/refresh"));
        assertThat(refresh.get("created").asInt()).isEqualTo(1);
        assertThat(refresh.get("sources").get(1).get("status").asText()).isEqualTo("PARTIAL");

        JsonNode n = call(get("/api/notifications")).get("notifications").get(0);
        assertThat(n.get("source").asText()).isEqualTo("POLICE");
        assertThat(n.get("atcId").asText()).isEqualTo("F2026100600004521");
        assertThat(n.get("fdSn").asInt()).isEqualTo(1);
        assertThat(n.get("foundItemId").isNull()).isTrue();
        assertThat(n.get("score").asInt()).isEqualTo(98);
        assertThat(n.get("foundTitle").asText()).isEqualTo("검정 반지갑");
        assertThat(notificationRepository.findAll()).extracting(x -> x.getCandidateKey())
                .containsExactly("POLICE:F2026100600004521-1");

        JsonNode again = call(post("/api/notifications/refresh"));
        assertThat(again.get("checkedLostItems").asInt()).isZero();
        assertThat(again.get("throttledLostItems").asInt()).isEqualTo(1);
        assertThat(again.get("created").asInt()).isZero();
        assertThat(POLICE_CALLS.get()).isEqualTo(1);
        assertThat(notificationRepository.count()).isEqualTo(1);
    }
}

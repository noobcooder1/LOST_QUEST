package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.matching.MatchCandidate;
import com.lostquest.service.matching.MatchSource;
import com.lostquest.service.matching.MatchTarget;
import com.lostquest.service.matching.PoliceCandidateCollector;
import com.lostquest.service.matching.SourceResult;
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
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Both sources return candidates: they are scored together, ranked once, and keep their own ids. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ItemMatchingMergeTest {

    private static final LocalDate LOST = LocalDate.of(2026, 8, 1);

    @TestConfiguration
    static class FakePoliceConfig {
        @Bean
        @Primary
        PoliceCandidateCollector fakePoliceCandidateCollector() {
            return new PoliceCandidateCollector(null, null) {
                @Override
                public SourceResult collect(MatchTarget target) {
                    return new SourceResult(MatchSource.POLICE, SourceResult.Status.PARTIAL, List.of(
                            new MatchCandidate(MatchSource.POLICE, "POLICE:F2026080200001-1", null, "F2026080200001", 1,
                                    "검정 반지갑", "지갑", "블랙(검정)", LOST, "서울특별시", null, "성동경찰서", null),
                            new MatchCandidate(MatchSource.POLICE, "POLICE:F2026080300002-1", null, "F2026080300002", 1,
                                    "지갑", "지갑", "블랙(검정)", LOST.plusDays(2), null, null, "부산진경찰서", null)),
                            "경찰청 습득물 일부 조회에 실패해 조회된 결과만 표시합니다.");
                }
            };
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
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("LOST QUEST + 경찰청 후보 통합 정렬, 출처별 ID, 경찰청 지역 미상은 지역 점수 없음")
    void mergesBothSources() throws Exception {
        User owner = userRepository.save(new User("owner2@lostquest.test", passwordEncoder.encode("Quest1234!"), "주인", UserRole.USER));
        User finder = userRepository.save(new User("finder2@lostquest.test", passwordEncoder.encode("Quest1234!"), "습득자", UserRole.USER));
        LostItem wallet = lostItemRepository.saveAndFlush(new LostItem(owner, "검은색 가죽 지갑", "지갑", "검정",
                "카드 두 장이 들어 있는 검은색 반지갑입니다.", LOST, "서울", "서울숲역 3번 출구", null, LostItemStatus.LOST));
        FoundItem lq = foundItemRepository.saveAndFlush(new FoundItem(finder, "검은 지갑", "지갑", "검정",
                "습득한 물건에 대한 설명입니다.", LOST.plusDays(1), "서울", "습득 장소", null, FoundItemStatus.STORED));

        String response = mockMvc.perform(get("/api/lost-items/" + wallet.getId() + "/matches")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwtTokenProvider.issueAccessToken(owner).value()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode body = objectMapper.readTree(response);
        JsonNode matches = body.get("matches");

        assertThat(matches).extracting(m -> m.get("id").asText())
                .containsExactly("POLICE:F2026080200001-1", "LOST_QUEST:" + lq.getId(), "POLICE:F2026080300002-1");
        assertThat(matches).extracting(m -> m.get("score").asInt()).containsExactly(100, 98, 73);

        JsonNode police = matches.get(0);
        assertThat(police.get("source").asText()).isEqualTo("POLICE");
        assertThat(police.get("atcId").asText()).isEqualTo("F2026080200001");
        assertThat(police.get("fdSn").asInt()).isEqualTo(1);
        assertThat(police.get("foundItemId").isNull()).isTrue();
        assertThat(police.get("storagePlace").asText()).isEqualTo("성동경찰서");

        JsonNode unknownRegion = matches.get(2);
        assertThat(unknownRegion.get("scoreBreakdown").get(1).get("result").asText()).isEqualTo("UNKNOWN");
        assertThat(unknownRegion.get("scoreBreakdown").get(1).get("points").asInt()).isZero();
        assertThat(unknownRegion.get("reasons")).extracting(JsonNode::asText)
                .containsExactly("같은 분류(지갑)", "같은 색상(블랙(검정))", "분실 2일 후 습득")
                .noneMatch(reason -> reason.contains("지역"));

        assertThat(body.get("sources").get(1).get("status").asText()).isEqualTo("PARTIAL");
        assertThat(body.get("sources").get(1).get("candidateCount").asInt()).isEqualTo(2);
    }
}

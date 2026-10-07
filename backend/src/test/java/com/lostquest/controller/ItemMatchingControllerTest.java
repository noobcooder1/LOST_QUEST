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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/lost-items/{id}/matches. The test profile has no 경찰청 keys, so the police source fails exactly like a
 * real outage (NOT_CONFIGURED) and LOST QUEST candidates must still be returned.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ItemMatchingControllerTest {

    private static final LocalDate LOST = LocalDate.of(2026, 8, 1);

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

    private User owner;
    private User finder;
    private String ownerToken;
    private String finderToken;
    private LostItem wallet;

    @BeforeEach
    void setUp() {
        owner = userRepository.save(new User("owner@lostquest.test", passwordEncoder.encode("Quest1234!"), "주인", UserRole.USER));
        finder = userRepository.save(new User("finder@lostquest.test", passwordEncoder.encode("Quest1234!"), "습득자", UserRole.USER));
        ownerToken = jwtTokenProvider.issueAccessToken(owner).value();
        finderToken = jwtTokenProvider.issueAccessToken(finder).value();
        wallet = lostItemRepository.saveAndFlush(new LostItem(owner, "검은색 가죽 지갑", "지갑", "검정",
                "카드 두 장이 들어 있는 검은색 반지갑입니다.", LOST, "서울", "서울숲역 3번 출구", null, LostItemStatus.LOST));
    }

    private FoundItem found(User user, String title, String category, String color, LocalDate date, String region,
                            FoundItemStatus status) {
        return foundItemRepository.saveAndFlush(new FoundItem(user, title, category, color,
                "습득한 물건에 대한 설명입니다.", date, region, "습득 장소", "/api/images/sample.jpg", status));
    }

    private ResultActions getMatches(long id, String token, String query) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/lost-items/" + id + "/matches" + query);
        if (token != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        return mockMvc.perform(request);
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("주인: LOST QUEST 후보를 점수순으로, 항목 점수·이유·출처와 함께 반환. 경찰청 실패는 출처 상태로만 표시")
    void ownerGetsRankedMatches() throws Exception {
        FoundItem exact = found(finder, "검은 지갑 주웠어요", "지갑", "검정색", LOST.plusDays(1), "서울", FoundItemStatus.STORED);
        FoundItem otherRegion = found(finder, "지갑 습득", "지갑", "검정", LOST.plusDays(5), "부산", FoundItemStatus.STORED);
        found(finder, "흰색 이어폰", "전자기기", "흰색", LOST.plusDays(1), "경기", FoundItemStatus.STORED); // 18 < 40
        found(finder, "반환된 지갑", "지갑", "검정", LOST, "서울", FoundItemStatus.RETURNED);             // not STORED
        found(finder, "분실 전 습득", "지갑", "검정", LOST.minusDays(1), "서울", FoundItemStatus.STORED);  // before loss
        found(finder, "한참 뒤 습득", "지갑", "검정", LOST.plusDays(31), "서울", FoundItemStatus.STORED);  // outside window
        found(owner, "내가 등록한 습득물", "지갑", "검정", LOST, "서울", FoundItemStatus.STORED);          // own item

        JsonNode body = json(getMatches(wallet.getId(), ownerToken, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItem.id").value(wallet.getId()))
                .andExpect(jsonPath("$.maxScore").value(100))
                .andExpect(jsonPath("$.minScore").value(40))
                .andExpect(jsonPath("$.limit").value(10)));

        JsonNode matches = body.get("matches");
        assertThat(matches).hasSize(2);
        JsonNode first = matches.get(0);
        assertThat(first.get("id").asText()).isEqualTo("LOST_QUEST:" + exact.getId());
        assertThat(first.get("source").asText()).isEqualTo("LOST_QUEST");
        assertThat(first.get("foundItemId").asLong()).isEqualTo(exact.getId());
        assertThat(first.get("score").asInt()).isEqualTo(35 + 25 + 20 + 18);
        assertThat(first.get("maxScore").asInt()).isEqualTo(100);
        assertThat(first.get("imageUrl").asText()).isEqualTo("/api/images/sample.jpg");
        assertThat(first.get("reasons")).extracting(JsonNode::asText)
                .containsExactly("같은 분류(지갑)", "같은 지역(서울)", "같은 색상(검정색)", "분실 1일 후 습득");

        JsonNode second = matches.get(1);
        assertThat(second.get("id").asText()).isEqualTo("LOST_QUEST:" + otherRegion.getId());
        assertThat(second.get("score").asInt()).isEqualTo(35 + 0 + 20 + 12);
        assertThat(second.get("reasons")).extracting(JsonNode::asText).doesNotContain("같은 지역(부산)");

        for (JsonNode match : matches) {
            int sum = 0;
            List<String> keys = new ArrayList<>();
            int awarded = 0;
            for (JsonNode component : match.get("scoreBreakdown")) {
                sum += component.get("points").asInt();
                keys.add(component.get("key").asText());
                if (component.get("points").asInt() > 0) {
                    awarded++;
                }
            }
            assertThat(sum).isEqualTo(match.get("score").asInt());
            assertThat(keys).containsExactly("category", "region", "color", "date");
            assertThat(match.get("reasons")).hasSize(awarded);
        }
        assertThat(body.toString()).doesNotContain("imageScore");
        // User-facing texts never claim an AI judgement.
        for (JsonNode reason : body.findValues("reasons")) {
            reason.forEach(text -> assertThat(text.asText()).doesNotContain("AI").doesNotContain("정확도").doesNotContain("확률"));
        }
        body.findValues("message").forEach(text -> assertThat(text.asText()).doesNotContain("AI"));

        JsonNode sources = body.get("sources");
        assertThat(sources.get(0).get("source").asText()).isEqualTo("LOST_QUEST");
        assertThat(sources.get(0).get("status").asText()).isEqualTo("OK");
        assertThat(sources.get(0).get("candidateCount").asInt()).isEqualTo(3);
        assertThat(sources.get(1).get("source").asText()).isEqualTo("POLICE");
        assertThat(sources.get(1).get("status").asText()).isEqualTo("UNAVAILABLE");
        assertThat(sources.get(1).get("message").asText()).isNotBlank().doesNotContain("serviceKey").doesNotContain("http");
    }

    @Test
    @DisplayName("limit 적용, 후보가 없으면 빈 목록 200")
    void limitAndEmpty() throws Exception {
        json(getMatches(wallet.getId(), ownerToken, "").andExpect(status().isOk()).andExpect(jsonPath("$.matches").isEmpty()));
        for (int i = 0; i < 3; i++) {
            found(finder, "지갑 " + i, "지갑", "검정", LOST.plusDays(i), "서울", FoundItemStatus.STORED);
        }
        getMatches(wallet.getId(), ownerToken, "?limit=2").andExpect(status().isOk())
                .andExpect(jsonPath("$.limit").value(2))
                .andExpect(jsonPath("$.matches.length()").value(2));
    }

    @Test
    @DisplayName("인증 없음/잘못된 토큰 401")
    void requiresAuthentication() throws Exception {
        getMatches(wallet.getId(), null, "").andExpect(status().isUnauthorized());
        getMatches(wallet.getId(), "not.a.jwt", "").andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("다른 사용자의 분실물은 403 (클라이언트 userId 파라미터는 무시)")
    void forbiddenForOtherUsers() throws Exception {
        getMatches(wallet.getId(), finderToken, "").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        getMatches(wallet.getId(), finderToken, "?userId=" + owner.getId()).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("없는 분실물 404, 잘못된 id/limit 400")
    void notFoundAndValidation() throws Exception {
        getMatches(999_999L, ownerToken, "").andExpect(status().isNotFound());
        getMatches(0L, ownerToken, "").andExpect(status().isBadRequest());
        getMatches(wallet.getId(), ownerToken, "?limit=0").andExpect(status().isBadRequest());
        getMatches(wallet.getId(), ownerToken, "?limit=21").andExpect(status().isBadRequest());
        getMatches(wallet.getId(), ownerToken, "?limit=20").andExpect(status().isOk());
        mockMvc.perform(get("/api/lost-items/abc/matches").header(HttpHeaders.AUTHORIZATION, "Bearer " + ownerToken))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET 외 메서드는 허용하지 않음")
    void onlyGet() throws Exception {
        mockMvc.perform(post("/api/lost-items/" + wallet.getId() + "/matches").header(HttpHeaders.AUTHORIZATION, "Bearer " + ownerToken))
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(401, 403, 405));
    }
}

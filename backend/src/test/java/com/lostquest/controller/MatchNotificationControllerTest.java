package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.entity.MatchNotification;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.MatchNotificationRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.matching.MatchSource;
import com.lostquest.service.notification.MatchNotificationWriter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /api/notifications end to end. Not @Transactional on purpose: notifications for a new found item are created
 * after its registration commits, so the test must really commit (and clean up afterwards). The test profile has
 * no 경찰청 keys, so the police source fails like a real outage. Refresh throttling is disabled here (interval 0)
 * so repeated refreshes really re-run matching; throttling has its own tests.
 */
@SpringBootTest(properties = "app.notifications.refresh-interval=PT0S")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MatchNotificationControllerTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final LocalDate LOST = TODAY.minusDays(5);

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
    private MatchNotificationWriter writer;
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
        cleanUp();
        owner = userRepository.save(new User("noti-owner@lostquest.test", passwordEncoder.encode("Quest1234!"), "주인", UserRole.USER));
        finder = userRepository.save(new User("noti-finder@lostquest.test", passwordEncoder.encode("Quest1234!"), "습득자", UserRole.USER));
        ownerToken = jwtTokenProvider.issueAccessToken(owner).value();
        finderToken = jwtTokenProvider.issueAccessToken(finder).value();
        wallet = lostItemRepository.saveAndFlush(new LostItem(owner, "검정 지갑", "지갑", "검정",
                "카드 두 장이 들어 있는 검은색 반지갑입니다.", LOST, "서울", "서울숲역 3번 출구", null, LostItemStatus.LOST));
    }

    @AfterEach
    void cleanUp() {
        notificationRepository.deleteAll();
        foundItemRepository.deleteAll();
        lostItemRepository.deleteAll();
        userRepository.deleteAll();
    }

    private ResultActions perform(MockHttpServletRequestBuilder request, String token) throws Exception {
        if (token != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        return mockMvc.perform(request);
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private long registerFound(String token, String title, String category, String color, LocalDate date, String region) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("category", category);
        body.put("color", color);
        body.put("description", "습득한 물건에 대한 설명입니다.");
        body.put("foundDate", date.toString());
        body.put("region", region);
        body.put("location", "습득 장소");
        return json(perform(post("/api/found-items").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)), token).andExpect(status().isCreated())).get("id").asLong();
    }

    private long unread(String token) throws Exception {
        return json(perform(get("/api/notifications/unread-count"), token).andExpect(status().isOk())).get("unreadCount").asLong();
    }

    @Test
    @DisplayName("습득물 등록 → 해당 분실물 주인에게 LOST QUEST 매칭 알림 1건 (대상 분실물·습득물·출처·점수·시각·읽음 여부)")
    void foundItemRegistrationNotifiesOwner() throws Exception {
        long foundId = registerFound(finderToken, "검은 지갑 주웠어요", "지갑", "검정색", LOST.plusDays(1), "서울");

        assertThat(unread(ownerToken)).isEqualTo(1);
        assertThat(unread(finderToken)).isZero();
        JsonNode body = json(perform(get("/api/notifications"), ownerToken).andExpect(status().isOk()));
        assertThat(body.get("unreadCount").asLong()).isEqualTo(1);
        JsonNode n = body.get("notifications").get(0);
        assertThat(n.get("lostItemId").asLong()).isEqualTo(wallet.getId());
        assertThat(n.get("lostItemTitle").asText()).isEqualTo("검정 지갑");
        assertThat(n.get("source").asText()).isEqualTo("LOST_QUEST");
        assertThat(n.get("foundItemId").asLong()).isEqualTo(foundId);
        assertThat(n.get("atcId").isNull()).isTrue();
        assertThat(n.get("foundTitle").asText()).isEqualTo("검은 지갑 주웠어요");
        assertThat(n.get("foundDate").asText()).isEqualTo(LOST.plusDays(1).toString());
        assertThat(n.get("score").asInt()).isEqualTo(35 + 25 + 20 + 18);
        assertThat(n.get("maxScore").asInt()).isEqualTo(100);
        assertThat(n.get("createdAt").asText()).isNotBlank();
        assertThat(n.get("read").asBoolean()).isFalse();
        assertThat(n.get("readAt").isNull()).isTrue();
        assertThat(body.toString()).doesNotContain("userId");
    }

    @Test
    @DisplayName("알림 기준 미달·기간 밖·습득자 본인 분실물은 알림 없음")
    void noNotificationBelowThresholdOrOwnItem() throws Exception {
        registerFound(finderToken, "흰색 이어폰", "전자기기", "흰색", LOST.plusDays(1), "서울");   // 25 + 18 = 43 < 70
        registerFound(finderToken, "지갑 습득", "지갑", "빨강", LOST.plusDays(4), "부산");         // 35 + 12 = 47 < 70
        registerFound(finderToken, "분실 전 습득", "지갑", "검정", LOST.minusDays(1), "서울");      // before the loss
        registerFound(ownerToken, "내가 주운 지갑", "지갑", "검정", LOST, "서울");                 // owner's own found item
        assertThat(notificationRepository.count()).isZero();
    }

    @Test
    @DisplayName("refresh: 경찰청 장애에도 LOST QUEST 후보 알림 생성, 두 번째 refresh와 이벤트 중복은 생성 0건")
    void refreshWithPoliceOutageAndNoDuplicates() throws Exception {
        registerFound(finderToken, "검은 지갑", "지갑", "검정", LOST, "서울");   // the event notifies (100)
        assertThat(notificationRepository.count()).isEqualTo(1);
        // A second matching candidate inserted without the event path (as if registered before this feature).
        foundItemRepository.saveAndFlush(new com.lostquest.entity.FoundItem(finder, "검정 카드지갑", "지갑", "검정",
                "습득한 물건에 대한 설명입니다.", LOST.plusDays(2), "서울", "습득 장소", null,
                com.lostquest.entity.FoundItemStatus.STORED));

        JsonNode first = json(perform(post("/api/notifications/refresh"), ownerToken).andExpect(status().isOk()));
        assertThat(first.get("checkedLostItems").asInt()).isEqualTo(1);
        assertThat(first.get("created").asInt()).isEqualTo(1);          // only the new candidate
        assertThat(first.get("unreadCount").asLong()).isEqualTo(2);
        JsonNode sources = first.get("sources");
        assertThat(sources.get(0).get("source").asText()).isEqualTo("LOST_QUEST");
        assertThat(sources.get(0).get("status").asText()).isEqualTo("OK");
        assertThat(sources.get(1).get("source").asText()).isEqualTo("POLICE");
        assertThat(sources.get(1).get("status").asText()).isEqualTo("UNAVAILABLE");
        assertThat(sources.get(1).get("message").asText()).isNotBlank().doesNotContain("serviceKey").doesNotContain("http");

        JsonNode second = json(perform(post("/api/notifications/refresh"), ownerToken).andExpect(status().isOk()));
        assertThat(second.get("checkedLostItems").asInt()).isEqualTo(1);
        assertThat(second.get("created").asInt()).isZero();
        assertThat(notificationRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("refresh는 본인의 최근 진행 중 분실물만 다시 매칭 (반환 완료·30일 지난 분실물·타인 분실물 제외)")
    void refreshTargetsOnlyOwnRecentOpenItems() throws Exception {
        lostItemRepository.saveAndFlush(new LostItem(owner, "찾은 지갑", "지갑", "검정", "이미 찾은 지갑에 대한 설명입니다.",
                LOST, "서울", "장소", null, LostItemStatus.RETURNED));
        lostItemRepository.saveAndFlush(new LostItem(owner, "오래된 지갑", "지갑", "검정", "오래전에 잃어버린 지갑입니다.",
                TODAY.minusDays(40), "서울", "장소", null, LostItemStatus.LOST));
        lostItemRepository.saveAndFlush(new LostItem(finder, "남의 지갑", "지갑", "검정", "다른 사람이 잃어버린 지갑입니다.",
                LOST, "서울", "장소", null, LostItemStatus.LOST));

        JsonNode body = json(perform(post("/api/notifications/refresh"), ownerToken).andExpect(status().isOk()));
        assertThat(body.get("checkedLostItems").asInt()).isEqualTo(1);
        JsonNode none = json(perform(post("/api/notifications/refresh"), finderToken).andExpect(status().isOk()));
        assertThat(none.get("checkedLostItems").asInt()).isEqualTo(1);
        assertThat(none.get("created").asInt()).isZero();
    }

    @Test
    @DisplayName("읽음 처리: 개별(멱등) → unread 감소, 모두 읽음은 본인 알림만")
    void markReadAndReadAll() throws Exception {
        registerFound(finderToken, "검은 지갑", "지갑", "검정", LOST, "서울");
        registerFound(finderToken, "검정 카드지갑", "지갑", "검정", LOST.plusDays(1), "서울");
        LostItem finderLost = lostItemRepository.saveAndFlush(new LostItem(finder, "갈색 가방", "가방", "갈색",
                "습득자가 잃어버린 갈색 가방입니다.", LOST, "부산", "부산역", null, LostItemStatus.LOST));
        registerFound(ownerToken, "갈색 가방 습득", "가방", "갈색", LOST, "부산");
        assertThat(unread(ownerToken)).isEqualTo(2);
        assertThat(unread(finderToken)).isEqualTo(1);

        JsonNode list = json(perform(get("/api/notifications"), ownerToken));
        long id = list.get("notifications").get(0).get("id").asLong();
        JsonNode read = json(perform(post("/api/notifications/" + id + "/read"), ownerToken).andExpect(status().isOk()));
        assertThat(read.get("read").asBoolean()).isTrue();
        String readAt = read.get("readAt").asText();
        assertThat(unread(ownerToken)).isEqualTo(1);
        JsonNode again = json(perform(post("/api/notifications/" + id + "/read"), ownerToken).andExpect(status().isOk()));
        assertThat(again.get("readAt").asText()).isEqualTo(readAt);
        assertThat(unread(ownerToken)).isEqualTo(1);

        perform(post("/api/notifications/read-all"), ownerToken).andExpect(status().isOk()).andExpect(jsonPath("$.unreadCount").value(0));
        assertThat(unread(ownerToken)).isZero();
        assertThat(unread(finderToken)).isEqualTo(1);
        assertThat(finderLost.getId()).isPositive();
    }

    @Test
    @DisplayName("타인 알림: 목록에 없음, 읽음 처리 404 (존재 여부 노출 없음), 상태 변경 없음")
    void otherUsersNotificationsAreInvisible() throws Exception {
        registerFound(finderToken, "검은 지갑", "지갑", "검정", LOST, "서울");
        long id = notificationRepository.findAll().get(0).getId();

        JsonNode finderList = json(perform(get("/api/notifications"), finderToken).andExpect(status().isOk()));
        assertThat(finderList.get("notifications")).isEmpty();
        perform(post("/api/notifications/" + id + "/read"), finderToken).andExpect(status().isNotFound());
        perform(post("/api/notifications/" + id + "/read?userId=" + owner.getId()), finderToken).andExpect(status().isNotFound());
        assertThat(notificationRepository.findById(id).orElseThrow().getReadAt()).isNull();
        assertThat(unread(ownerToken)).isEqualTo(1);
    }

    @Test
    @DisplayName("인증 없음/잘못된 토큰 401, 잘못된 ID 400, 없는 ID 404, limit 검증")
    void authenticationAndValidation() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(get("/api/notifications"), get("/api/notifications/unread-count"),
                post("/api/notifications/1/read"), post("/api/notifications/read-all"), post("/api/notifications/refresh"))) {
            perform(request, null).andExpect(status().isUnauthorized());
        }
        perform(get("/api/notifications"), "not.a.jwt").andExpect(status().isUnauthorized());

        perform(post("/api/notifications/0/read"), ownerToken).andExpect(status().isBadRequest());
        perform(post("/api/notifications/abc/read"), ownerToken).andExpect(status().isBadRequest());
        perform(post("/api/notifications/99999999/read"), ownerToken).andExpect(status().isNotFound());
        perform(get("/api/notifications?limit=0"), ownerToken).andExpect(status().isBadRequest());
        perform(get("/api/notifications?limit=101"), ownerToken).andExpect(status().isBadRequest());
        perform(get("/api/notifications?limit=100"), ownerToken).andExpect(status().isOk());
    }

    @Test
    @DisplayName("동시 생성: 같은 분실물+후보를 8개 스레드가 동시에 저장해도 1건")
    void concurrentInsertCreatesOneRow() throws Exception {
        long foundId = foundItemRepository.saveAndFlush(new com.lostquest.entity.FoundItem(finder, "검은 지갑", "지갑", "검정",
                "습득한 물건에 대한 설명입니다.", LOST, "서울", "습득 장소", null, com.lostquest.entity.FoundItemStatus.STORED)).getId();
        MatchNotificationWriter.NewNotification n = new MatchNotificationWriter.NewNotification(owner.getId(), wallet.getId(),
                MatchSource.LOST_QUEST, "LOST_QUEST:" + foundId, foundId, null, null, "검은 지갑", LOST, 100, 100);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        try (ExecutorService executor = Executors.newFixedThreadPool(8)) {
            for (int i = 0; i < 8; i++) {
                Callable<Boolean> task = () -> {
                    start.await();
                    try {
                        return writer.insertIfAbsent(n);
                    } catch (DataIntegrityViolationException duplicate) {
                        return false;
                    }
                };
                results.add(executor.submit(task));
            }
            start.countDown();
            int inserted = 0;
            for (Future<Boolean> result : results) {
                inserted += result.get() ? 1 : 0;
            }
            assertThat(inserted).isEqualTo(1);
        }
        List<MatchNotification> rows = notificationRepository.findAll();
        assertThat(rows).hasSize(1);
    }

    @Test
    @DisplayName("회귀: 알림 기능이 있어도 매칭 추천 API 결과는 동일하게 동작")
    void matchingApiStillWorks() throws Exception {
        registerFound(finderToken, "검은 지갑", "지갑", "검정", LOST.plusDays(1), "서울");
        perform(get("/api/lost-items/" + wallet.getId() + "/matches"), ownerToken).andExpect(status().isOk())
                .andExpect(jsonPath("$.matches[0].score").value(98))
                .andExpect(jsonPath("$.matches[0].source").value("LOST_QUEST"))
                .andExpect(jsonPath("$.sources[1].status").value("UNAVAILABLE"));
        perform(get("/api/lost-items/" + wallet.getId() + "/matches"), finderToken).andExpect(status().isForbidden());
        // Viewing recommendations creates no extra notification.
        assertThat(notificationRepository.count()).isEqualTo(1);
    }
}

package com.lostquest.controller;

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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** GET /api/me/items: only the JWT user's own lost and found items, newest first. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class MyItemControllerTest {

    private static final LocalDate DATE = LocalDate.of(2026, 9, 16);
    private static final Instant T0 = Instant.parse("2026-10-01T00:00:00Z");

    @Autowired
    private MockMvc mockMvc;
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

    private User me;
    private User other;
    private String myToken;

    @BeforeEach
    void setUp() {
        me = userRepository.save(new User("me@lostquest.test", passwordEncoder.encode("Quest1234!"), "나", UserRole.USER));
        other = userRepository.save(new User("other@lostquest.test", passwordEncoder.encode("Quest1234!"), "다른사람", UserRole.USER));
        myToken = jwtTokenProvider.issueAccessToken(me).value();
    }

    @Test
    @DisplayName("내 분실물만 있으면 lostItems에 담기고 foundItems는 빈 배열 (200)")
    void returnsMyLostItems() throws Exception {
        LostItem wallet = lost(me, "검은색 가죽 지갑", T0);

        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems", hasSize(1)))
                .andExpect(jsonPath("$.lostItems[0].id").value(wallet.getId()))
                .andExpect(jsonPath("$.lostItems[0].userId").value(me.getId()))
                .andExpect(jsonPath("$.lostItems[0].title").value("검은색 가죽 지갑"))
                .andExpect(jsonPath("$.lostItems[0].category").value("지갑"))
                .andExpect(jsonPath("$.lostItems[0].lostDate").value("2026-09-16"))
                .andExpect(jsonPath("$.lostItems[0].region").value("서울"))
                .andExpect(jsonPath("$.lostItems[0].status").value("LOST"))
                .andExpect(jsonPath("$.lostItems[0].createdAt").exists())
                .andExpect(jsonPath("$.foundItems", hasSize(0)));
    }

    @Test
    @DisplayName("내 습득물만 있으면 foundItems에 담기고 lostItems는 빈 배열 (200)")
    void returnsMyFoundItems() throws Exception {
        FoundItem earbuds = found(me, "화이트 무선 이어폰", T0);

        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems", hasSize(0)))
                .andExpect(jsonPath("$.foundItems", hasSize(1)))
                .andExpect(jsonPath("$.foundItems[0].id").value(earbuds.getId()))
                .andExpect(jsonPath("$.foundItems[0].userId").value(me.getId()))
                .andExpect(jsonPath("$.foundItems[0].foundDate").value("2026-09-16"))
                .andExpect(jsonPath("$.foundItems[0].status").value("STORED"));
    }

    @Test
    @DisplayName("분실물과 습득물을 함께 조회하고 서버가 정한 imageUrl을 그대로 돌려준다")
    void returnsBothKinds() throws Exception {
        LostItem lostWithImage = lostItemRepository.saveAndFlush(withCreatedAt(new LostItem(me, "사진 있는 가방", "가방", "남색",
                "남색 백팩입니다. 앞주머니에 작은 키링이 있어요.", DATE, "대전", "대전역 대합실",
                "/api/images/3f2c1c9e-8a5b-4f43-9d0a-5a1c3b7e9f10.png", LostItemStatus.LOST), T0));
        found(me, "열쇠 꾸러미", T0);

        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems", hasSize(1)))
                .andExpect(jsonPath("$.lostItems[0].id").value(lostWithImage.getId()))
                .andExpect(jsonPath("$.lostItems[0].imageUrl").value("/api/images/3f2c1c9e-8a5b-4f43-9d0a-5a1c3b7e9f10.png"))
                .andExpect(jsonPath("$.foundItems", hasSize(1)))
                .andExpect(jsonPath("$.foundItems[0].title").value("열쇠 꾸러미"))
                .andExpect(jsonPath("$.foundItems[0].imageUrl").doesNotExist());
    }

    @Test
    @DisplayName("다른 사용자의 분실물·습득물은 응답에 섞이지 않는다")
    void excludesOtherUsersItems() throws Exception {
        lost(me, "내 지갑", T0);
        found(me, "내가 주운 이어폰", T0);
        lost(other, "남의 지갑", T0.plusSeconds(10));
        lost(other, "남의 가방", T0.plusSeconds(20));
        found(other, "남이 주운 우산", T0.plusSeconds(30));

        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems[*].title", contains("내 지갑")))
                .andExpect(jsonPath("$.lostItems[*].userId", everyItem(is(me.getId().intValue()))))
                .andExpect(jsonPath("$.foundItems[*].title", contains("내가 주운 이어폰")))
                .andExpect(jsonPath("$.foundItems[*].userId", everyItem(is(me.getId().intValue()))));

        String otherToken = jwtTokenProvider.issueAccessToken(other).value();
        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems[*].title", contains("남의 가방", "남의 지갑")))
                .andExpect(jsonPath("$.foundItems[*].title", contains("남이 주운 우산")));
    }

    @Test
    @DisplayName("클라이언트가 보낸 userId 쿼리는 무시하고 JWT 사용자의 물품만 돌려준다")
    void ignoresClientSuppliedUserId() throws Exception {
        lost(me, "내 지갑", T0);
        lost(other, "남의 지갑", T0);

        mockMvc.perform(get("/api/me/items").param("userId", String.valueOf(other.getId()))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems[*].title", contains("내 지갑")));
    }

    @Test
    @DisplayName("등록한 물품이 없으면 404가 아니라 200과 빈 배열")
    void returnsEmptyListsWhenNothingRegistered() throws Exception {
        lost(other, "남의 지갑", T0);

        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems").isArray())
                .andExpect(jsonPath("$.lostItems", hasSize(0)))
                .andExpect(jsonPath("$.foundItems").isArray())
                .andExpect(jsonPath("$.foundItems", hasSize(0)));
    }

    @Test
    @DisplayName("최신 등록순: createdAt 내림차순, 같은 시각이면 id 내림차순 (id 순서와 다른 createdAt도 따른다)")
    void ordersNewestFirst() throws Exception {
        // Saved in this order (ascending ids) but with deliberately different registration times.
        lost(me, "가장 오래됨", T0);
        lost(me, "가장 최근", T0.plusSeconds(300));
        lost(me, "중간", T0.plusSeconds(100));
        lost(me, "중간과 같은 시각, 나중 id", T0.plusSeconds(100));
        found(me, "습득 오래됨", T0);
        found(me, "습득 최근", T0.plusSeconds(60));

        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lostItems[*].title",
                        contains("가장 최근", "중간과 같은 시각, 나중 id", "중간", "가장 오래됨")))
                .andExpect(jsonPath("$.foundItems[*].title", contains("습득 최근", "습득 오래됨")));
    }

    @Test
    @DisplayName("토큰이 없거나 잘못되면 401 (UNAUTHORIZED / INVALID_TOKEN)")
    void requiresAuthentication() throws Exception {
        lost(me, "내 지갑", T0);

        mockMvc.perform(get("/api/me/items"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.path").value("/api/me/items"));
        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Basic bWU6cGFzcw=="))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("DB에 없는 사용자의 유효한 JWT는 500이 아닌 401")
    void rejectsTokenForMissingUser() throws Exception {
        User ghost = new User("ghost@lostquest.test", passwordEncoder.encode("Quest1234!"), "유령", UserRole.USER);
        ReflectionTestUtils.setField(ghost, "id", 999_999L);
        String ghostToken = jwtTokenProvider.issueAccessToken(ghost).value();

        mockMvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + ghostToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    @DisplayName("이 경로는 조회 전용: POST는 허용되지 않는다")
    void onlyGetIsAllowed() throws Exception {
        mockMvc.perform(post("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + myToken))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("기존 공개 조회 API는 토큰 없이 그대로 동작: 모든 사용자의 물품, id 오름차순")
    void publicEndpointsAreUnchanged() throws Exception {
        LostItem first = lost(me, "내 지갑", T0.plusSeconds(100));
        LostItem second = lost(other, "남의 지갑", T0);
        FoundItem foundItem = found(other, "남이 주운 우산", T0);

        mockMvc.perform(get("/api/lost-items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(first.getId()))
                .andExpect(jsonPath("$[1].id").value(second.getId()));
        mockMvc.perform(get("/api/lost-items/{id}", second.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("남의 지갑"));
        mockMvc.perform(get("/api/found-items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get("/api/found-items/{id}", foundItem.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("남이 주운 우산"));
    }

    private LostItem lost(User owner, String title, Instant createdAt) {
        return lostItemRepository.saveAndFlush(withCreatedAt(new LostItem(owner, title, "지갑", "검정",
                "카드가 들어 있는 검은색 반지갑입니다.", DATE, "서울", "서울숲역 3번 출구", null, LostItemStatus.LOST), createdAt));
    }

    private FoundItem found(User owner, String title, Instant createdAt) {
        return foundItemRepository.saveAndFlush(withCreatedAt(new FoundItem(owner, title, "전자기기", "흰색",
                "흰색 충전 케이스와 이어폰 한 쌍을 보관하고 있어요.", DATE, "경기", "광교중앙역 정류장", null, FoundItemStatus.STORED), createdAt));
    }

    /** createdAt is normally assigned on persist (now); tests pin it to prove the ordering does not depend on ids. */
    private static <T> T withCreatedAt(T entity, Instant createdAt) {
        ReflectionTestUtils.setField(entity, "createdAt", createdAt);
        return entity;
    }
}

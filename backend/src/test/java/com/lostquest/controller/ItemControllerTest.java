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
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ItemControllerTest {

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

    private User author;
    private User otherUser;
    private String token;

    @BeforeEach
    void setUp() {
        author = userRepository.save(new User("author@lostquest.test", passwordEncoder.encode("Quest1234!"), "작성자", UserRole.USER));
        otherUser = userRepository.save(new User("other@lostquest.test", passwordEncoder.encode("Quest1234!"), "다른사람", UserRole.USER));
        token = jwtTokenProvider.issueAccessToken(author).value();
    }

    @Test
    @DisplayName("분실·습득 날짜와 별개로 실제 등록 시각을 서버가 생성하고 조회 시에도 유지")
    void registrationTimestampIsActualServerTime() throws Exception {
        for (String type : new String[]{"lost", "found"}) {
            Map<String, Object> request = type.equals("lost") ? lostBody() : foundBody();
            String dateField = type.equals("lost") ? "lostDate" : "foundDate";
            request.put(dateField, "2000-01-02");
            request.put("createdAt", "1999-01-01T00:00:00Z");
            Instant before = Instant.now();
            JsonNode created = readJson(postItem("/api/" + type + "-items", request, token)
                    .andExpect(status().isCreated()));
            Instant after = Instant.now();
            Instant actual = Instant.parse(created.get("createdAt").asText());
            assertThat(actual).isBetween(before, after);
            assertThat(created.get(dateField).asText()).isEqualTo("2000-01-02");
            JsonNode loaded = readJson(mockMvc.perform(get("/api/" + type + "-items/" + created.get("id").asLong()))
                    .andExpect(status().isOk()));
            assertThat(Instant.parse(loaded.get("createdAt").asText())).isEqualTo(actual);
        }
    }

    @Test
    @DisplayName("인증된 사용자 분실물 등록 성공: 201, 작성자=JWT 사용자, status=LOST, DB 저장")
    void createLostItem() throws Exception {
        JsonNode body = readJson(postItem("/api/lost-items", lostBody(), token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.userId").value(author.getId()))
                .andExpect(jsonPath("$.title").value("검은색 가죽 지갑"))
                .andExpect(jsonPath("$.category").value("지갑"))
                .andExpect(jsonPath("$.color").value("검정"))
                .andExpect(jsonPath("$.lostDate").value("2026-09-16"))
                .andExpect(jsonPath("$.region").value("서울"))
                .andExpect(jsonPath("$.location").value("서울 성동구 서울숲역 3번 출구"))
                .andExpect(jsonPath("$.status").value("LOST"))
                .andExpect(jsonPath("$.imageUrl").doesNotExist())
                .andExpect(jsonPath("$.createdAt").exists()));

        LostItem saved = lostItemRepository.findById(body.get("id").asLong()).orElseThrow();
        assertThat(saved.getUser().getId()).isEqualTo(author.getId());
        assertThat(saved.getStatus()).isEqualTo(LostItemStatus.LOST);
        assertThat(saved.getRegion()).isEqualTo("서울");
        assertThat(saved.getImageUrl()).isNull();
    }

    @Test
    @DisplayName("인증된 사용자 습득물 등록 성공: 201, 작성자=JWT 사용자, status=STORED, 공백 정리")
    void createFoundItem() throws Exception {
        Map<String, Object> request = foundBody();
        request.put("title", "  화이트 무선 이어폰  ");
        JsonNode body = readJson(postItem("/api/found-items", request, token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(author.getId()))
                .andExpect(jsonPath("$.title").value("화이트 무선 이어폰"))
                .andExpect(jsonPath("$.foundDate").value("2026-09-21"))
                .andExpect(jsonPath("$.region").value("경기"))
                .andExpect(jsonPath("$.status").value("STORED")));

        FoundItem saved = foundItemRepository.findById(body.get("id").asLong()).orElseThrow();
        assertThat(saved.getUser().getId()).isEqualTo(author.getId());
        assertThat(saved.getStatus()).isEqualTo(FoundItemStatus.STORED);
    }

    @Test
    @DisplayName("클라이언트가 보낸 userId/status/imageUrl/id는 무시되고 서버 값으로 저장")
    void clientCannotChooseAuthorStatusOrImage() throws Exception {
        Map<String, Object> lost = lostBody();
        lost.put("userId", otherUser.getId());
        lost.put("user", Map.of("id", otherUser.getId()));
        lost.put("status", "RETURNED");
        lost.put("imageUrl", "data:image/png;base64,AAAA");
        lost.put("id", 999);
        JsonNode lostBody = readJson(postItem("/api/lost-items", lost, token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(author.getId()))
                .andExpect(jsonPath("$.status").value("LOST"))
                .andExpect(jsonPath("$.imageUrl").doesNotExist()));
        LostItem savedLost = lostItemRepository.findById(lostBody.get("id").asLong()).orElseThrow();
        assertThat(savedLost.getUser().getId()).isEqualTo(author.getId()).isNotEqualTo(otherUser.getId());
        assertThat(savedLost.getImageUrl()).isNull();

        Map<String, Object> found = foundBody();
        found.put("userId", otherUser.getId());
        found.put("status", "CLOSED");
        found.put("imageUrl", "https://evil.example/x.png");
        postItem("/api/found-items", found, token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(author.getId()))
                .andExpect(jsonPath("$.status").value("STORED"))
                .andExpect(jsonPath("$.imageUrl").doesNotExist());
    }

    @Test
    @DisplayName("비로그인 POST는 401 UNAUTHORIZED, DB에 저장되지 않음")
    void createRequiresAuthentication() throws Exception {
        postItem("/api/lost-items", lostBody(), null)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.path").value("/api/lost-items"));
        postItem("/api/found-items", foundBody(), null)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        postItem("/api/lost-items", lostBody(), "not.a.jwt")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        assertThat(lostItemRepository.count()).isZero();
        assertThat(foundItemRepository.count()).isZero();
    }

    @Test
    @DisplayName("DB에 없는 사용자의 유효한 JWT로 등록하면 500이 아닌 401")
    void createRejectsTokenForMissingUser() throws Exception {
        User ghost = new User("ghost@lostquest.test", passwordEncoder.encode("Quest1234!"), "유령", UserRole.USER);
        ReflectionTestUtils.setField(ghost, "id", 999_999L);
        String ghostToken = jwtTokenProvider.issueAccessToken(ghost).value();
        postItem("/api/lost-items", lostBody(), ghostToken)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        assertThat(lostItemRepository.count()).isZero();
    }

    @Test
    @DisplayName("잘못된 입력은 400 VALIDATION_ERROR (필수값, 길이, 카테고리/지역 목록)")
    void createRejectsInvalidInput() throws Exception {
        Map<String, Object> invalid = new LinkedHashMap<>();
        invalid.put("title", " ");
        invalid.put("category", "노트북");
        invalid.put("color", "");
        invalid.put("description", "짧음");
        invalid.put("region", "서울특별시");
        invalid.put("location", "x".repeat(201));
        postItem("/api/lost-items", invalid, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.path").value("/api/lost-items"))
                .andExpect(jsonPath("$.errors[*].field",
                        hasItems("title", "category", "color", "description", "lostDate", "region", "location")));

        Map<String, Object> longTitle = foundBody();
        longTitle.put("title", "가".repeat(101));
        postItem("/api/found-items", longTitle, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[*].field", hasItem("title")));
        assertThat(lostItemRepository.count()).isZero();
        assertThat(foundItemRepository.count()).isZero();
    }

    @Test
    @DisplayName("미래 날짜는 400, 오늘 날짜는 허용")
    void createRejectsFutureDate() throws Exception {
        Map<String, Object> lost = lostBody();
        lost.put("lostDate", LocalDate.now().plusDays(1).toString());
        postItem("/api/lost-items", lost, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors[*].field", hasItem("lostDate")));

        Map<String, Object> found = foundBody();
        found.put("foundDate", LocalDate.now().plusYears(1).toString());
        postItem("/api/found-items", found, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[*].field", hasItem("foundDate")));

        found.put("foundDate", LocalDate.now().toString());
        postItem("/api/found-items", found, token).andExpect(status().isCreated());
        assertThat(lostItemRepository.count()).isZero();
    }

    @Test
    @DisplayName("존재하지 않는 날짜나 깨진 JSON은 400 INVALID_REQUEST")
    void createRejectsMalformedBody() throws Exception {
        Map<String, Object> lost = lostBody();
        lost.put("lostDate", "2026-13-40");
        postItem("/api/lost-items", lost, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(post("/api/found-items").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{broken"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("등록 후 비로그인 목록 조회 성공 (region 포함, ID 오름차순)")
    void listIncludesCreatedItemsWithoutLogin() throws Exception {
        long first = readJson(postItem("/api/lost-items", lostBody(), token)).get("id").asLong();
        Map<String, Object> second = lostBody();
        second.put("title", "네이비 백팩");
        second.put("category", "가방");
        second.put("region", "대전");
        long secondId = readJson(postItem("/api/lost-items", second, token)).get("id").asLong();
        postItem("/api/found-items", foundBody(), token).andExpect(status().isCreated());

        mockMvc.perform(get("/api/lost-items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(first))
                .andExpect(jsonPath("$[1].id").value(secondId))
                .andExpect(jsonPath("$[1].region").value("대전"))
                .andExpect(jsonPath("$[1].userId").value(author.getId()));
        mockMvc.perform(get("/api/found-items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("STORED"))
                .andExpect(jsonPath("$[0].region").value("경기"));
    }

    @Test
    @DisplayName("등록 후 비로그인 상세 조회 성공, 없는 ID는 404, 0 이하 ID는 400")
    void detailAndNotFound() throws Exception {
        long lostId = readJson(postItem("/api/lost-items", lostBody(), token)).get("id").asLong();
        long foundId = readJson(postItem("/api/found-items", foundBody(), token)).get("id").asLong();

        mockMvc.perform(get("/api/lost-items/{id}", lostId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(lostId))
                .andExpect(jsonPath("$.title").value("검은색 가죽 지갑"))
                .andExpect(jsonPath("$.region").value("서울"));
        mockMvc.perform(get("/api/found-items/{id}", foundId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("화이트 무선 이어폰"));

        mockMvc.perform(get("/api/lost-items/{id}", 987_654L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mockMvc.perform(get("/api/found-items/{id}", 987_654L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mockMvc.perform(get("/api/found-items/{id}", 0))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("허용 Origin에서 Authorization 헤더를 포함한 등록 POST preflight 허용")
    void corsAllowsAuthenticatedItemPost() throws Exception {
        mockMvc.perform(options("/api/lost-items")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"));
    }

    private Map<String, Object> lostBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "검은색 가죽 지갑");
        body.put("category", "지갑");
        body.put("color", "검정");
        body.put("description", "검은색 반지갑입니다. 겉면에 작은 스크래치가 있어요.");
        body.put("lostDate", "2026-09-16");
        body.put("region", "서울");
        body.put("location", "서울 성동구 서울숲역 3번 출구");
        return body;
    }

    private Map<String, Object> foundBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "화이트 무선 이어폰");
        body.put("category", "전자기기");
        body.put("color", "흰색");
        body.put("description", "흰색 충전 케이스와 이어폰 한 쌍을 보관하고 있어요.");
        body.put("foundDate", "2026-09-21");
        body.put("region", "경기");
        body.put("location", "경기 수원시 광교중앙역 버스 정류장");
        return body;
    }

    private ResultActions postItem(String path, Map<String, Object> body, String bearer) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
        if (bearer != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        }
        return mockMvc.perform(request);
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }
}

package com.lostquest.controller;

import com.fasterxml.jackson.databind.*;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.TestImages;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional
class CommunityPostControllerTest {
    private static final String PATH = "/api/community/posts";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired CommunityPostRepository posts;
    @Autowired CommunityQuestionRepository questions;
    @Autowired LostItemRepository lost;
    @Autowired FoundItemRepository found;
    @Autowired ItemImageRepository images;
    @Autowired JwtTokenProvider tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired EntityManager em;
    User author;
    String token;
    LostItem lostItem;
    FoundItem foundItem;

    @BeforeEach void setup() {
        author = users.saveAndFlush(new User("discussion-author@lostquest.test", passwords.encode("Quest1234!"), "이웃", UserRole.USER));
        token = tokens.issueAccessToken(author).value();
        lostItem = lost.saveAndFlush(new LostItem(author, "물품 목록에만 있는 지갑", "지갑", "검정", "물품 설명",
            LocalDate.now(), "서울", "서울역", null, LostItemStatus.LOST));
        foundItem = found.saveAndFlush(new FoundItem(author, "물품 목록에만 있는 우산", "기타", "검정", "물품 설명",
            LocalDate.now(), "서울", "서울역", null, FoundItemStatus.STORED));
    }

    Map<String, Object> input() { return new HashMap<>(Map.of("category", "chat", "title", "반가워요", "content", "동네 이웃들과 이야기해요.")); }
    ResultActions create(Map<String, Object> body, String bearer) throws Exception {
        var request = post(PATH).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
        if (bearer != null) request.header("Authorization", "Bearer " + bearer);
        return mvc.perform(request);
    }
    JsonNode body(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsByteArray()); }
    CommunityPost save(CommunityCategory category, String title, String content, String instant) {
        CommunityPost post = new CommunityPost(author, category, title, content, null, null, null);
        ReflectionTestUtils.setField(post, "createdAt", Instant.parse(instant));
        return posts.saveAndFlush(post);
    }
    ResultActions upload(Map<String, Object> post, MockMultipartFile image, String bearer) throws Exception {
        var request = multipart(PATH).file(new MockMultipartFile("post", "", "application/json", json.writeValueAsBytes(post)));
        if (image != null) request.file(image);
        if (bearer != null) request.header("Authorization", "Bearer " + bearer);
        // A real multipart request is larger than 16 KiB; the small-JSON filter must not consume/reject it.
        request.content(new byte[20_000]);
        return mvc.perform(request);
    }

    @Test void publicDiscussionListStartsEmptyAndNeverMixesItemOrPrivateQuestionRecords() throws Exception {
        User requester = users.saveAndFlush(new User("discussion-requester@lostquest.test", author.getPassword(), "질문자", UserRole.USER));
        questions.saveAndFlush(new CommunityQuestion(CommunityItemType.FOUND, foundItem.getId(), foundItem.getTitle(),
            author, requester, "비공개 소유 확인 질문"));
        mvc.perform(get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty())
            .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.hasNext").value(false));
        var input = input(); input.put("authorId", 99999); input.put("createdAt", "2000-01-01T00:00:00Z");
        JsonNode saved = body(create(input, token).andExpect(status().isCreated())
            .andExpect(jsonPath("$.authorNickname").value("이웃")).andExpect(jsonPath("$.category").value("chat"))
            .andExpect(jsonPath("$.linkedItem").isEmpty()).andExpect(jsonPath("$.imageUrl").isEmpty())
            .andExpect(jsonPath("$.email").doesNotExist()).andExpect(jsonPath("$.authorId").doesNotExist()));
        long id = saved.get("id").asLong();
        assertThat(posts.findById(id).orElseThrow().getAuthor().getId()).isEqualTo(author.getId());
        assertThat(saved.get("createdAt").asText()).isNotEqualTo("2000-01-01T00:00:00Z");
        mvc.perform(get(PATH + "/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("반가워요"));
        String list = mvc.perform(get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
            .andReturn().getResponse().getContentAsString();
        assertThat(list).doesNotContain("물품 목록에만", "비공개 소유 확인 질문", "ownership", "discussion-author@");
        mvc.perform(get("/api/lost-items")).andExpect(jsonPath("$[0].title").value(lostItem.getTitle()));
        mvc.perform(get("/api/community/questions")).andExpect(status().isUnauthorized());
    }

    @Test void combinesCategoryTitleOrBodySearchAndInclusiveKoreanCalendarDates() throws Exception {
        save(CommunityCategory.INFO, "정류장 안내", "보관소를 이용해요", "2026-10-18T14:59:59Z"); // 18th KST
        CommunityPost start = save(CommunityCategory.INFO, "보관소 안내", "첫 시각", "2026-10-18T15:00:00Z");
        CommunityPost end = save(CommunityCategory.INFO, "동네 안내", "보관소 마지막 시각", "2026-10-19T14:59:59.999999Z");
        save(CommunityCategory.INFO, "보관소 다음 날", "범위 밖", "2026-10-19T15:00:00Z");
        save(CommunityCategory.CHAT, "보관소 잡담", "다른 카테고리", "2026-10-19T00:00:00Z");
        mvc.perform(get(PATH).param("category", "info").param("q", "보관소").param("from", "2026-10-19").param("to", "2026-10-19"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2))
            .andExpect(jsonPath("$.items[0].id").value(end.getId())).andExpect(jsonPath("$.items[1].id").value(start.getId()));
        mvc.perform(get(PATH).param("q", "없는 검색어")).andExpect(jsonPath("$.items").isEmpty());
    }

    @Test void searchesLiteralWildcardsAndOrdersTimestampTiesByNewestIdWithBoundedPagination() throws Exception {
        for (int i = 0; i < 21; i++) save(CommunityCategory.CHAT, "같은 시각 " + i, "본문", "2026-10-19T00:00:00Z");
        Long newest = posts.findAll().stream().map(CommunityPost::getId).max(Long::compare).orElseThrow();
        mvc.perform(get(PATH)).andExpect(jsonPath("$.items.length()").value(20))
            .andExpect(jsonPath("$.items[0].id").value(newest)).andExpect(jsonPath("$.hasNext").value(true));
        mvc.perform(get(PATH).param("page", "1")).andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.hasNext").value(false));
        save(CommunityCategory.INFO, "100%_안내!", "Hello Nearby", "2026-10-20T00:00:00Z");
        mvc.perform(get(PATH).param("q", "%_")).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get(PATH).param("q", "hello nearby")).andExpect(jsonPath("$.items.length()").value(1));
    }

    @ParameterizedTest @ValueSource(strings = {"lost", "found"})
    void linksOnlyCurrentPublicItemsAndRemovesLinkMetadataAfterHidingOrClosing(String type) throws Exception {
        long itemId = type.equals("lost") ? lostItem.getId() : foundItem.getId();
        var input = input(); input.put("linkedItemType", type); input.put("linkedItemId", itemId);
        long id = body(create(input, token).andExpect(status().isCreated())
            .andExpect(jsonPath("$.linkedItem.id").value(itemId)).andExpect(jsonPath("$.linkedItem.type").value(type)))
            .get("id").asLong();
        if (type.equals("lost")) lostItem.hide(); else foundItem.close();
        em.flush(); em.clear();
        mvc.perform(get(PATH + "/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.linkedItem").isEmpty());
        mvc.perform(get(PATH)).andExpect(jsonPath("$.items[0].linkedItem").isEmpty());
        create(input, token).andExpect(status().isNotFound());
        input.put("linkedItemId", 999999); create(input, token).andExpect(status().isNotFound());
    }

    @ParameterizedTest @ValueSource(strings = {"jpeg", "png", "webp"})
    void storesOneOptionalValidatedImageAndServesTheSameBytesPublicly(String format) throws Exception {
        byte[] bytes = switch (format) {
            case "jpeg" -> TestImages.jpeg(320, 240);
            case "png" -> TestImages.pngPaddedTo(20_000);
            default -> TestImages.webp("valid-alpha.webp");
        };
        String imageUrl = body(upload(input(), new MockMultipartFile("image", "photo." + format, "image/" + format, bytes), token)
            .andExpect(status().isCreated()).andExpect(jsonPath("$.imageUrl").isString())).get("imageUrl").asText();
        em.flush(); em.clear();
        assertThat(images.count()).isEqualTo(1);
        mvc.perform(get(imageUrl)).andExpect(status().isOk()).andExpect(content().bytes(bytes));
        assertThat(posts.findAll().get(0).getImageUrl()).isEqualTo(imageUrl);
    }

    @Test void rejectsInvalidImagesWithoutCreatingPostsOrImageRows() throws Exception {
        upload(input(), new MockMultipartFile("image", "bad.png", "image/png", TestImages.signatureOnly("png")), token)
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_IMAGE"));
        upload(input(), new MockMultipartFile("image", "big.png", "image/png", new byte[10 * 1024 * 1024 + 1]), token)
            .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.code").value("IMAGE_TOO_LARGE"));
        var invalid = input(); invalid.put("title", " ");
        upload(invalid, new MockMultipartFile("image", "valid.png", "image/png", TestImages.png(32, 24)), token)
            .andExpect(status().isBadRequest());
        assertThat(images.count()).isZero(); assertThat(posts.count()).isZero();
    }

    @Test void requiresAuthenticatedDatabaseAuthorForJsonAndMultipartWrites() throws Exception {
        create(input(), null).andExpect(status().isUnauthorized());
        create(input(), "invalid.jwt").andExpect(status().isUnauthorized());
        upload(input(), new MockMultipartFile("image", "photo.png", "image/png", TestImages.png(32, 24)), null)
            .andExpect(status().isUnauthorized());
        User ghost = new User("ghost-post@lostquest.test", passwords.encode("Quest1234!"), "유령", UserRole.USER);
        ReflectionTestUtils.setField(ghost, "id", 999999L);
        create(input(), tokens.issueAccessToken(ghost).value()).andExpect(status().isUnauthorized());
        assertThat(posts.count()).isZero(); assertThat(images.count()).isZero();
    }

    @Test void rejectsInvalidFiltersIdsLinksAndUntrustedPublicText() throws Exception {
        mvc.perform(get(PATH).param("from", "9999-12-31").param("to", "9999-12-31"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        for (String query : List.of("?category=lost", "?from=2026-10-20&to=2026-10-19", "?from=bad-date", "?page=-1", "?page=10001", "?q=" + "가".repeat(101)))
            mvc.perform(get(PATH + query)).andExpect(status().isBadRequest());
        mvc.perform(get(PATH + "/0")).andExpect(status().isBadRequest());
        mvc.perform(get(PATH + "/999999")).andExpect(status().isNotFound());
        for (Map<String, Object> invalid : List.of(Map.<String, Object>of("category", "lost"), Map.<String, Object>of("title", " "),
                Map.<String, Object>of("title", "가".repeat(121)), Map.<String, Object>of("content", "가".repeat(3001)),
                Map.<String, Object>of("content", "<script>bad</script>"), Map.<String, Object>of("content", "연락 010-1234-5678"),
                Map.<String, Object>of("linkedItemType", "lost"), Map.<String, Object>of("linkedItemId", lostItem.getId()),
                Map.<String, Object>of("linkedItemType", "police", "linkedItemId", lostItem.getId()),
                Map.<String, Object>of("linkedItemType", "lost", "linkedItemId", 0))) {
            var input = input(); input.putAll(invalid); create(input, token).andExpect(status().isBadRequest());
        }
        var oversized = input(); oversized.put("content", "가".repeat(17000));
        create(oversized, token).andExpect(status().isPayloadTooLarge());
        assertThat(posts.count()).isZero();
    }

    @Test void acceptsMaximumKoreanTextAndThrottlesPostsPerAuthenticatedUser() throws Exception {
        var maximum = input(); maximum.put("title", "가".repeat(120)); maximum.put("content", "나".repeat(3000));
        create(maximum, token).andExpect(status().isCreated());
        for (int i = 1; i < 10; i++) create(input(), token).andExpect(status().isCreated());
        create(input(), token).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "60"));
        assertThat(posts.count()).isEqualTo(10);
    }
}

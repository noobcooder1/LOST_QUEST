package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.OwnershipProof;
import com.lostquest.service.TestImages;
import com.lostquest.service.matching.MatchSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ItemManagementControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired LostItemRepository lost;
    @Autowired FoundItemRepository found;
    @Autowired ReturnRequestRepository returns;
    @Autowired MatchNotificationRepository notifications;
    @Autowired ItemImageRepository images;
    @Autowired ExperienceEventRepository experience;
    @Autowired JwtTokenProvider tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired OwnershipProof proof;

    User author;
    User other;
    String token;
    String otherToken;

    @BeforeEach
    void setUp() {
        author = users.save(new User("manage@lostquest.test", passwords.encode("Quest1234!"), "작성자", UserRole.USER));
        other = users.save(new User("manage-other@lostquest.test", passwords.encode("Quest1234!"), "다른 사용자", UserRole.USER));
        token = tokens.issueAccessToken(author).value();
        otherToken = tokens.issueAccessToken(other).value();
    }

    @Test
    void authorCanUpdateBothItemTypesWithoutChangingAuthorStatusTimestampOrXp() throws Exception {
        for (String type : new String[]{"lost", "found"}) {
            JsonNode created = create(type);
            long xp = experience.total(author.getId());
            Map<String, Object> body = body(type);
            body.put("title", "  수정한 물품글  ");
            body.put("category", "기타");
            body.put("color", "파랑");
            body.put("description", "새로 확인한 물품의 상세 특징을 적었습니다.");
            body.put(type + "Date", "2001-01-02");
            body.put("region", "경기");
            body.put("location", "수정한 상세 장소");
            body.put("userId", other.getId());
            body.put("status", "RETURNED");
            body.put("createdAt", "1999-01-01T00:00:00Z");
            body.put("imageUrl", "https://invalid.test/photo.png");
            JsonNode updated = json(update(path(type, created), body, token)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.title").value("수정한 물품글"))
                    .andExpect(jsonPath("$.category").value("기타"))
                    .andExpect(jsonPath("$.color").value("파랑"))
                    .andExpect(jsonPath("$.description").value(body.get("description")))
                    .andExpect(jsonPath("$." + type + "Date").value("2001-01-02"))
                    .andExpect(jsonPath("$.region").value("경기"))
                    .andExpect(jsonPath("$.location").value("수정한 상세 장소"))
                    .andExpect(jsonPath("$.userId").value(author.getId()))
                    .andExpect(jsonPath("$.status").value(type.equals("lost") ? "LOST" : "STORED"))
                    .andExpect(jsonPath("$.imageUrl").doesNotExist()));
            assertThat(updated.get("createdAt")).isEqualTo(created.get("createdAt"));
            assertThat(experience.total(author.getId())).isEqualTo(xp);
            mvc.perform(get(path(type, created))).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("수정한 물품글"));
        }
    }

    @Test
    void onlyAuthenticatedAuthorCanUpdateOrDelete() throws Exception {
        for (String type : new String[]{"lost", "found"}) {
            String path = path(type, create(type));
            update(path, body(type), null).andExpect(status().isUnauthorized());
            mvc.perform(delete(path)).andExpect(status().isUnauthorized());
            update(path, body(type), otherToken).andExpect(status().isForbidden());
            mvc.perform(delete(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + otherToken)).andExpect(status().isForbidden());
            mvc.perform(get(path)).andExpect(status().isOk());
        }
    }

    @Test
    void updateValidatesFieldsAndMissingOrInvalidIds() throws Exception {
        for (String type : new String[]{"lost", "found"}) {
            JsonNode created = create(type);
            Map<String, Object> body = body(type);
            body.put("title", " ");
            update(path(type, created), body, token).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            update("/api/" + type + "-items/99999999", body(type), token).andExpect(status().isNotFound());
            update("/api/" + type + "-items/0", body(type), token).andExpect(status().isBadRequest());
            mvc.perform(delete("/api/" + type + "-items/99999999").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andExpect(status().isNotFound());
            mvc.perform(get(path(type, created))).andExpect(jsonPath("$.title").value("등록한 물품"));
        }
    }

    @Test
    void ownershipQuestionCanBeChangedWithPostAndNeverExposesPrivateAnswer() throws Exception {
        JsonNode created = create("found");
        long id = created.get("id").asLong();
        Map<String, Object> input = body("found");
        input.put("ownershipQuestion", "안쪽에 적힌 문구는 무엇인가요?");
        input.put("ownershipAnswer", "별빛");
        update(path("found", created), input, token).andExpect(status().isOk())
                .andExpect(jsonPath("$.ownershipQuestion").value(input.get("ownershipQuestion")))
                .andExpect(jsonPath("$.ownershipConfigured").value(true))
                .andExpect(jsonPath("$.ownershipAnswer").doesNotExist())
                .andExpect(jsonPath("$.ownershipAnswerHash").doesNotExist());
        String oldHash = found.findById(id).orElseThrow().ownershipAnswerHash();
        assertThat(proof.matches("별빛", oldHash)).isTrue();
        update(path("found", created), body("found"), token).andExpect(status().isOk());
        assertThat(found.findById(id).orElseThrow().ownershipAnswerHash()).isEqualTo(oldHash);
        input.put("ownershipQuestion", "새 질문만 입력");
        input.put("ownershipAnswer", "");
        update(path("found", created), input, token).andExpect(status().isBadRequest());
        assertThat(found.findById(id).orElseThrow().getOwnershipQuestion()).isEqualTo("안쪽에 적힌 문구는 무엇인가요?");
        input.put("ownershipAnswer", "새 답변");
        update(path("found", created), input, token).andExpect(status().isOk());
        assertThat(proof.matches("새 답변", found.findById(id).orElseThrow().ownershipAnswerHash())).isTrue();
    }

    @Test
    void deletionHidesPostsFromListsDetailMyItemsMatchingAndProfileWhileKeepingXp() throws Exception {
        JsonNode lostJson = create("lost");
        JsonNode foundJson = create("found");
        long xp = experience.total(author.getId());
        for (var item : Map.of("lost", lostJson, "found", foundJson).entrySet()) {
            mvc.perform(delete(path(item.getKey(), item.getValue())).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                    .andExpect(status().isNoContent()).andExpect(content().string(""));
            mvc.perform(get(path(item.getKey(), item.getValue()))).andExpect(status().isNotFound());
            mvc.perform(get("/api/" + item.getKey() + "-items")).andExpect(jsonPath("$.length()").value(0));
            update(path(item.getKey(), item.getValue()), body(item.getKey()), token).andExpect(status().isNotFound());
        }
        mvc.perform(get("/api/me/items").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.lostItems.length()").value(0)).andExpect(jsonPath("$.foundItems.length()").value(0));
        mvc.perform(get("/api/lost-items/" + lostJson.get("id").asLong() + "/matches").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/me/activity").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.profile.registeredCount").value(0)).andExpect(jsonPath("$.profile.xp").value(xp));
        assertThat(lost.findById(lostJson.get("id").asLong()).orElseThrow().getStatus()).isEqualTo(LostItemStatus.CLOSED);
        assertThat(found.findById(foundJson.get("id").asLong()).orElseThrow().getStatus()).isEqualTo(FoundItemStatus.CLOSED);
    }

    @Test
    void ongoingAndCompletedReturnsBlockBothItemMutations() throws Exception {
        for (ReturnStatus state : ReturnStatus.values()) {
            if (state == ReturnStatus.REJECTED) continue;
            JsonNode lostJson = create("lost");
            JsonNode foundJson = create("found");
            ReturnRequest request = new ReturnRequest(found.findById(foundJson.get("id").asLong()).orElseThrow(), other,
                    lost.findById(lostJson.get("id").asLong()).orElseThrow());
            request.transition(state);
            returns.saveAndFlush(request);
            for (var item : Map.of("lost", lostJson, "found", foundJson).entrySet()) {
                update(path(item.getKey(), item.getValue()), body(item.getKey()), token)
                        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("WORKFLOW_CONFLICT"));
                mvc.perform(delete(path(item.getKey(), item.getValue())).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                        .andExpect(status().isConflict());
            }
        }
    }

    @Test
    void rejectedReturnHistorySurvivesEditingAndDeletion() throws Exception {
        JsonNode lostJson = create("lost");
        JsonNode foundJson = create("found");
        ReturnRequest request = new ReturnRequest(found.findById(foundJson.get("id").asLong()).orElseThrow(), other,
                lost.findById(lostJson.get("id").asLong()).orElseThrow());
        request.transition(ReturnStatus.REJECTED);
        returns.saveAndFlush(request);
        for (var item : Map.of("lost", lostJson, "found", foundJson).entrySet()) {
            update(path(item.getKey(), item.getValue()), body(item.getKey()), token).andExpect(status().isOk());
            mvc.perform(delete(path(item.getKey(), item.getValue())).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andExpect(status().isNoContent());
        }
        mvc.perform(get("/api/returns/" + request.getId()).header(HttpHeaders.AUTHORIZATION, "Bearer " + otherToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        assertThat(returns.findById(request.getId())).isPresent();
    }

    @Test
    void returnedPostCannotBeChangedEvenWithoutLinkedRequest() throws Exception {
        JsonNode lostJson = create("lost");
        JsonNode foundJson = create("found");
        lost.findById(lostJson.get("id").asLong()).orElseThrow().markReturned();
        found.findById(foundJson.get("id").asLong()).orElseThrow().markReturned();
        for (var item : Map.of("lost", lostJson, "found", foundJson).entrySet()) {
            update(path(item.getKey(), item.getValue()), body(item.getKey()), token).andExpect(status().isConflict());
            mvc.perform(delete(path(item.getKey(), item.getValue())).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andExpect(status().isConflict());
        }
    }

    @Test
    void imageCanBeAddedPreservedReplacedAndRemovedForBothTypes() throws Exception {
        for (String type : new String[]{"lost", "found"}) {
            JsonNode created = create(type);
            String path = path(type, created);
            String firstImage = json(upload(path, body(type), image(TestImages.png(24, 24)), token).andExpect(status().isOk())).get("imageUrl").asText();
            mvc.perform(get(firstImage)).andExpect(status().isOk());
            update(path, body(type), token).andExpect(status().isOk()).andExpect(jsonPath("$.imageUrl").value(firstImage));
            String replaced = json(upload(path, body(type), image(TestImages.png(32, 32)), token).andExpect(status().isOk())).get("imageUrl").asText();
            assertThat(replaced).isNotEqualTo(firstImage);
            Map<String, Object> remove = body(type);
            remove.put("removeImage", true);
            upload(path, remove, image(TestImages.png(24, 24)), token).andExpect(status().isBadRequest());
            mvc.perform(get(path)).andExpect(jsonPath("$.imageUrl").value(replaced));
            update(path, remove, token).andExpect(status().isOk()).andExpect(jsonPath("$.imageUrl").doesNotExist());
        }
    }

    @Test
    void rejectedImageOrUnauthorizedUploadDoesNotWriteImageOrChangePost() throws Exception {
        for (String type : new String[]{"lost", "found"}) {
            JsonNode created = create(type);
            Map<String, Object> changed = body(type);
            changed.put("title", "저장되면 안 되는 제목");
            long before = images.count();
            upload(path(type, created), changed, image(TestImages.png(24, 24)), otherToken).andExpect(status().isForbidden());
            upload(path(type, created), changed, image(TestImages.signatureOnly("png")), token).andExpect(status().isBadRequest());
            assertThat(images.count()).isEqualTo(before);
            mvc.perform(get(path(type, created))).andExpect(jsonPath("$.title").value("등록한 물품"))
                    .andExpect(jsonPath("$.imageUrl").doesNotExist());
        }
    }

    @Test
    void deletionRemovesRelatedMatchNotificationsAndHidesLateInserts() throws Exception {
        JsonNode lostJson = create("lost");
        JsonNode foundJson = create("found");
        LostItem target = lost.findById(lostJson.get("id").asLong()).orElseThrow();
        FoundItem candidate = found.findById(foundJson.get("id").asLong()).orElseThrow();
        notifications.saveAndFlush(notification(target, candidate));
        mvc.perform(delete(path("found", foundJson)).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andExpect(status().isNoContent());
        assertThat(notifications.count()).isZero();
        // A refresh that read the candidate before deletion must not restore a visible stale notification.
        notifications.saveAndFlush(notification(target, candidate));
        mvc.perform(get("/api/notifications").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.notifications.length()").value(0)).andExpect(jsonPath("$.unreadCount").value(0));
        mvc.perform(get("/api/notifications/unread-count").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.unreadCount").value(0));
        mvc.perform(delete(path("lost", lostJson)).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andExpect(status().isNoContent());
        assertThat(notifications.count()).isZero();
    }

    @Test
    void browserPreflightAllowsItemPutAndDelete() throws Exception {
        for (String method : new String[]{"PUT", "DELETE"}) {
            mvc.perform(options("/api/found-items/1")
                    .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                    .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, method)
                    .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"))
                    .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"));
        }
    }

    private MatchNotification notification(LostItem item, FoundItem candidate) {
        return new MatchNotification(author, item, MatchSource.LOST_QUEST, "LOST_QUEST:" + candidate.getId(), candidate.getId(),
                null, null, candidate.getTitle(), candidate.getFoundDate(), 80, 100);
    }

    private JsonNode create(String type) throws Exception {
        return json(mvc.perform(post("/api/" + type + "-items").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body(type)))).andExpect(status().isCreated()));
    }

    private Map<String, Object> body(String type) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "등록한 물품");
        body.put("category", "지갑");
        body.put("color", "검정");
        body.put("description", "안쪽에 비공개 특징이 있는 검은색 물품입니다.");
        body.put(type + "Date", "2000-01-02");
        body.put("region", "서울");
        body.put("location", "서울역 대합실");
        return body;
    }

    private String path(String type, JsonNode item) { return "/api/" + type + "-items/" + item.get("id").asLong(); }

    private ResultActions update(String path, Map<String, Object> body, String bearer) throws Exception {
        var request = put(path).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body));
        if (bearer != null) request.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        return mvc.perform(request);
    }

    private MockMultipartFile image(byte[] bytes) { return new MockMultipartFile("image", "photo.png", "image/png", bytes); }

    private ResultActions upload(String path, Map<String, Object> body, MockMultipartFile image, String bearer) throws Exception {
        var request = multipart(HttpMethod.PUT, path)
                .file(new MockMultipartFile("item", "", MediaType.APPLICATION_JSON_VALUE, mapper.writeValueAsBytes(body))).file(image);
        if (bearer != null) request.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        return mvc.perform(request);
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return mapper.readTree(actions.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }
}

package com.lostquest.controller;

import com.fasterxml.jackson.databind.*;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.OwnershipProof;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional
class CommunityControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired LostItemRepository lost;
    @Autowired FoundItemRepository found;
    @Autowired CommunityQuestionRepository questions;
    @Autowired CommunityReportRepository reports;
    @Autowired ExperienceEventRepository xp;
    @Autowired JwtTokenProvider tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired OwnershipProof proof;
    @Autowired EntityManager em;
    User author, requester, stranger, admin;
    String a, b, c, d;
    LostItem lostPost;
    FoundItem foundPost;
    @BeforeEach void setup() {
        String hash = passwords.encode("Quest1234!");
        author = users.save(new User("community-author@lostquest.test", hash, "작성자", UserRole.USER));
        requester = users.save(new User("community-requester@lostquest.test", hash, "질문자", UserRole.USER));
        stranger = users.save(new User("community-stranger@lostquest.test", hash, "제삼자", UserRole.USER));
        admin = users.save(new User("community-admin@lostquest.test", hash, "관리자", UserRole.ADMIN));
        a = tokens.issueAccessToken(author).value(); b = tokens.issueAccessToken(requester).value();
        c = tokens.issueAccessToken(stranger).value(); d = tokens.issueAccessToken(admin).value();
        lostPost = lost.saveAndFlush(new LostItem(author, "검은 분실 지갑", "지갑", "검정", "지갑을 잃어버렸어요",
            LocalDate.now(), "서울", "서울역", null, LostItemStatus.LOST));
        foundPost = new FoundItem(author, "검은 습득 지갑", "지갑", "검정", "지갑을 주웠어요",
            LocalDate.now(), "서울", "서울역", null, FoundItemStatus.STORED);
        foundPost.configureOwnership("안쪽 스티커의 색상은?", proof.encode("파란색"));
        foundPost = found.saveAndFlush(foundPost);
    }
    String postPath(String type) { return "/api/community/" + type + "/" + (type.equals("lost") ? lostPost.getId() : foundPost.getId()); }
    ResultActions send(String token, String path, Object body) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        return mvc.perform(request);
    }
    ResultActions read(String token, String path) throws Exception {
        var request = get(path); if (token != null) request.header("Authorization", "Bearer " + token);
        return mvc.perform(request);
    }
    JsonNode body(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsByteArray()); }
    long ask(String type) throws Exception {
        return body(send(b, postPath(type) + "/questions", Map.of("message", "안쪽에 스티커가 있나요?", "authorId", stranger.getId(), "requesterId", stranger.getId()))
            .andExpect(status().isCreated())).get("id").asLong();
    }
    @ParameterizedTest @ValueSource(strings = {"lost", "found"})
    void persistsPrivateQuestionAndAnswerWithOnlyTwoParticipants(String type) throws Exception {
        long id = ask(type);
        String path = "/api/community/questions/" + id;
        read(a, path).andExpect(status().isOk()).andExpect(jsonPath("$.canAnswer").value(true));
        read(b, path).andExpect(status().isOk()).andExpect(jsonPath("$.canAnswer").value(false));
        read(c, path).andExpect(status().isForbidden());
        read(d, path).andExpect(status().isForbidden()); // Admin has no correspondence override.
        read(null, path).andExpect(status().isUnauthorized());
        read(c, postPath(type) + "/questions").andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        read(a, "/api/community/questions").andExpect(jsonPath("$.items[0].id").value(id));
        send(b, path + "/answer", Map.of("message", "타인 답변")).andExpect(status().isForbidden());
        send(c, path + "/answer", Map.of("message", "타인 답변")).andExpect(status().isForbidden());
        send(d, path + "/answer", Map.of("message", "관리자 답변")).andExpect(status().isForbidden());
        send(a, path + "/answer", Map.of("message", "네, 소유자 확인 절차로 진행해 주세요."))
            .andExpect(status().isOk()).andExpect(jsonPath("$.answeredAt").isString());
        send(a, path + "/answer", Map.of("message", "중복 답변")).andExpect(status().isConflict());
        em.flush(); em.clear();
        var saved = questions.findById(id).orElseThrow();
        assertThat(saved.getRequester().getId()).isEqualTo(requester.getId());
        assertThat(saved.getAuthor().getId()).isEqualTo(author.getId());
        assertThat(saved.getAnswer()).isEqualTo("네, 소유자 확인 절차로 진행해 주세요.");
        read(b, path).andExpect(jsonPath("$.answer").value(saved.getAnswer()))
            .andExpect(jsonPath("$.email").doesNotExist()).andExpect(jsonPath("$.requester").doesNotExist());
        String publicBody = read(null, "/api/" + type + "-items").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(publicBody).doesNotContain("안쪽에 스티커가 있나요?", saved.getAnswer(), "community-requester@");
    }
    @ParameterizedTest @ValueSource(strings = {"lost", "found"})
    void rejectsUnauthenticatedInvalidSelfAndMissingPostWrites(String type) throws Exception {
        String path = postPath(type) + "/questions";
        send(null, path, Map.of("message", "질문")).andExpect(status().isUnauthorized());
        send(a, path, Map.of("message", "본인 질문")).andExpect(status().isConflict());
        for (String message : List.of(" ", "가".repeat(1001), "<script>alert(1)</script>"))
            send(b, path, Map.of("message", message)).andExpect(status().isBadRequest());
        send(b, "/api/community/" + type + "/999999/questions", Map.of("message", "질문")).andExpect(status().isNotFound());
        send(b, "/api/community/invalid/1/questions", Map.of("message", "질문")).andExpect(status().isBadRequest());
        send(b, "/api/community/" + type + "/0/questions", Map.of("message", "질문")).andExpect(status().isBadRequest());
        read(b, path + "?page=-1").andExpect(status().isBadRequest());
        send(b, path, Map.of("message", "가".repeat(17000))).andExpect(status().isPayloadTooLarge());
        assertThat(questions.count()).isZero();
    }
    @ParameterizedTest @ValueSource(strings = {"lost", "found"})
    void onlyDatabaseAdminCanReviewAndHideWithDuplicateReportProtection(String type) throws Exception {
        String path = postPath(type) + "/reports";
        send(null, path, Map.of("message", "허위 게시글")).andExpect(status().isUnauthorized());
        send(b, path, Map.of("message", "허위 게시글")).andExpect(status().isCreated());
        send(b, path, Map.of("message", "중복 신고")).andExpect(status().isConflict());
        read(b, "/api/community/reports").andExpect(status().isForbidden());
        long id = body(read(d, "/api/community/reports").andExpect(status().isOk())).get("items").get(0).get("id").asLong();
        send(a, "/api/community/reports/" + id + "/hide", Map.of()).andExpect(status().isForbidden());
        send(d, "/api/community/reports/" + id + "/hide", Map.of()).andExpect(status().isOk());
        send(d, "/api/community/reports/" + id + "/hide", Map.of()).andExpect(status().isOk());
        read(null, "/api/" + type + "-items/" + (type.equals("lost") ? lostPost.getId() : foundPost.getId()))
            .andExpect(status().isNotFound());
        JsonNode rows = body(read(null, "/api/" + type + "-items").andExpect(status().isOk()));
        assertThat(rows).isEmpty();
        send(c, postPath(type) + "/questions", Map.of("message", "새 질문")).andExpect(status().isNotFound());
        read(a, "/api/me/items").andExpect(status().isOk()); // Author's private history remains.
        assertThat(reports.count()).isEqualTo(1);
        if (type.equals("found")) {
            send(b, "/api/returns", Map.of("foundItemId", foundPost.getId())).andExpect(status().isNotFound());
            assertThat(found.findById(foundPost.getId()).orElseThrow().getStatus()).isEqualTo(FoundItemStatus.STORED);
            assertThat(found.findTop200ByHiddenFalseAndStatusAndFoundDateBetweenAndUser_IdNotOrderByFoundDateAscIdAsc(
                FoundItemStatus.STORED, LocalDate.now(), LocalDate.now().plusDays(1), requester.getId())).isEmpty();
        }
    }
    @ParameterizedTest @ValueSource(strings = {"lost", "found"})
    void hiddenHistoryIsLabelledAndMutationsExplainModerationAfterCheckingOwner(String type) throws Exception {
        if (type.equals("lost")) lostPost.hide(); else foundPost.hide();
        em.flush();
        String collection = type.equals("lost") ? "lostItems" : "foundItems";
        read(a, "/api/me/items").andExpect(status().isOk()).andExpect(jsonPath("$." + collection + "[0].hidden").value(true));
        read(b, "/api/me/items").andExpect(jsonPath("$." + collection).isEmpty());
        long id = type.equals("lost") ? lostPost.getId() : foundPost.getId();
        String path = "/api/" + type + "-items/" + id;
        read(null, path).andExpect(status().isNotFound());
        Map<String, Object> edit = new HashMap<>(Map.of("title", "검정 지갑", "category", "지갑", "color", "검정",
                "description", "검증용 물품 설명입니다", "region", "서울", "location", "서울역"));
        edit.put(type + "Date", LocalDate.now().toString());
        for (String token : List.of(a, b)) {
            var update = mvc.perform(put(path).header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(edit)));
            var deletion = mvc.perform(delete(path).header("Authorization", "Bearer " + token));
            if (token.equals(a)) {
                update.andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("관리자가 숨김 처리한 물품글은 수정하거나 삭제할 수 없습니다."));
                deletion.andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("관리자가 숨김 처리한 물품글은 수정하거나 삭제할 수 없습니다."));
            } else {
                update.andExpect(status().isForbidden()); deletion.andExpect(status().isForbidden());
            }
        }
        mvc.perform(delete(path)).andExpect(status().isUnauthorized());
    }
    @Test void correspondenceDoesNotBypassOwnershipQrOrOneTimeReward() throws Exception {
        long question = ask("found");
        send(a, "/api/community/questions/" + question + "/answer", Map.of("message", "소유자 확인 후 돌려드릴게요.")).andExpect(status().isOk());
        read(null, "/api/found-items/" + foundPost.getId()).andExpect(jsonPath("$.ownershipQuestion").isEmpty());
        long id = body(send(b, "/api/returns", Map.of("foundItemId", foundPost.getId())).andExpect(status().isCreated())).get("id").asLong();
        String path = "/api/returns/" + id;
        send(a, path + "/approve", Map.of()).andExpect(status().isConflict());
        send(b, path + "/verify-owner", Map.of("answer", "파란색")).andExpect(status().isOk());
        read(b, path).andExpect(jsonPath("$.foundItem.ownershipQuestion").value("안쪽 스티커의 색상은?"));
        send(a, path + "/approve", Map.of()).andExpect(status().isOk());
        String token = body(read(b, path)).get("qrToken").asText();
        send(a, path + "/verify-qr", Map.of("token", token)).andExpect(status().isOk());
        send(a, path + "/verify-qr", Map.of("token", token)).andExpect(status().isConflict());
        send(a, path + "/complete", Map.of()).andExpect(status().isForbidden());
        send(d, path + "/complete", Map.of()).andExpect(status().isOk());
        send(d, path + "/complete", Map.of()).andExpect(status().isOk());
        em.flush(); em.clear();
        assertThat(xp.total(author.getId())).isEqualTo(50);
        read(null, "/api/found-items/" + foundPost.getId()).andExpect(jsonPath("$.status").value("RETURNED"));
    }
    @Test void enforcesQuestionFrequencyLimitWithoutAutomaticRetry() throws Exception {
        for (int i = 0; i < 20; i++) send(b, postPath("found") + "/questions", Map.of("message", "질문 " + i)).andExpect(status().isCreated());
        send(b, postPath("found") + "/questions", Map.of("message", "초과 질문"))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "60"));
        assertThat(questions.count()).isEqualTo(20);
        read(a, postPath("found") + "/questions").andExpect(jsonPath("$.items.length()").value(20));
    }
    @Test void paginatesOnlyVisibleQuestionsAndNeverReturnsOtherUsersThreads() throws Exception {
        for (int i = 0; i < 21; i++) questions.save(new CommunityQuestion(CommunityItemType.FOUND, foundPost.getId(), foundPost.getTitle(), author, requester, "질문 " + i));
        questions.saveAndFlush(new CommunityQuestion(CommunityItemType.FOUND, foundPost.getId(), foundPost.getTitle(), author, stranger, "다른 사용자의 비공개 질문"));
        read(b, postPath("found") + "/questions").andExpect(jsonPath("$.items.length()").value(20)).andExpect(jsonPath("$.hasNext").value(true));
        var page = body(read(b, postPath("found") + "/questions?page=1").andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.hasNext").value(false)));
        assertThat(page.toString()).doesNotContain("다른 사용자의 비공개 질문");
        read(c, postPath("found") + "/questions").andExpect(jsonPath("$.items.length()").value(1));
    }
    @Test void staleAdminTokenCannotOverrideTheCurrentDatabaseRole() throws Exception {
        org.springframework.test.util.ReflectionTestUtils.setField(admin, "role", UserRole.USER);
        users.saveAndFlush(admin); em.clear();
        read(d, "/api/community/reports").andExpect(status().isForbidden());
    }
    @Test void rejectsPublicContactsHtmlAndOversizePostsAndIgnoresClientAuthor() throws Exception {
        var input = new HashMap<String, Object>(Map.of("title", "새 지갑", "category", "지갑", "color", "검정", "description", "서울역에서 지갑을 잃어버렸어요",
            "lostDate", LocalDate.now().toString(), "region", "서울", "location", "서울역", "userId", stranger.getId()));
        long id = body(send(b, "/api/lost-items", input).andExpect(status().isCreated())).get("id").asLong();
        assertThat(lost.findById(id).orElseThrow().getUser().getId()).isEqualTo(requester.getId());
        for (String description : List.of("<img src=x onerror=alert(1)>", "연락 010-1234-5678", "메일 me@example.com")) {
            input.put("description", description); send(b, "/api/lost-items", input).andExpect(status().isBadRequest());
        }
        input.put("description", "가".repeat(17000)); send(b, "/api/lost-items", input).andExpect(status().isPayloadTooLarge());
    }
}

package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.OwnershipProof;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional
class ReturnControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired FoundItemRepository found;
    @Autowired LostItemRepository lost;
    @Autowired ReturnRequestRepository returns;
    @Autowired ExperienceEventRepository experience;
    @Autowired JwtTokenProvider tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired OwnershipProof proof;
    @Autowired EntityManager entities;
    User requester, finder, stranger;
    FoundItem item;
    LostItem linked;
    String requesterToken, finderToken, strangerToken;
    @BeforeEach void setup() {
        String hash = passwords.encode("Quest1234!");
        requester = users.save(new User("owner@lostquest.test", hash, "소유자", UserRole.USER));
        finder = users.save(new User("finder@lostquest.test", hash, "습득자", UserRole.USER));
        stranger = users.save(new User("stranger@lostquest.test", hash, "다른회원", UserRole.USER));
        requesterToken = tokens.issueAccessToken(requester).value();
        finderToken = tokens.issueAccessToken(finder).value();
        strangerToken = tokens.issueAccessToken(stranger).value();
        item = new FoundItem(finder, "검은색 지갑", "지갑", "검정", "안쪽에 스티커가 있는 지갑입니다",
                LocalDate.now(), "서울", "서울역", null, FoundItemStatus.STORED);
        item.configureOwnership("안쪽 스티커 색상은?", proof.encode("파란색"));
        item = found.saveAndFlush(item);
        linked = lost.saveAndFlush(new LostItem(requester, "내 지갑", "지갑", "검정", "안쪽에 스티커가 있는 지갑입니다",
                LocalDate.now(), "서울", "서울역", null, LostItemStatus.LOST));
    }
    ResultActions postJson(String token, String path, Object body) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
        if(token != null) request.header("Authorization", "Bearer " + token);
        return mvc.perform(request);
    }
    JsonNode read(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsByteArray()); }
    Long create() throws Exception {
        return read(postJson(requesterToken, "/api/returns", Map.of("foundItemId", item.getId(), "lostItemId", linked.getId()))
                .andExpect(status().isCreated())).get("id").asLong();
    }
    String path(Long id, String action) { return "/api/returns/" + id + "/" + action; }
    void verify(Long id) throws Exception {
        postJson(requesterToken, path(id,"verify-owner"), Map.of("answer"," 파 란 색 ")).andExpect(status().isOk());
    }
    void approve(Long id) throws Exception { postJson(finderToken,path(id,"approve"),Map.of()).andExpect(status().isOk()); }
    String qr(Long id) throws Exception {
        JsonNode body = read(mvc.perform(get("/api/returns/" + id).header("Authorization","Bearer " + requesterToken)).andExpect(status().isOk()));
        return body.get("qrToken").asText();
    }
    @Test void persistsFullWorkflowAndAwardsFinderExactlyOnce() throws Exception {
        Long id = create(); verify(id); approve(id);
        String token = qr(id);
        postJson(finderToken,path(id,"verify-qr"),Map.of("token","LOSTQUEST:RETURN:" + id + ":" + token)).andExpect(status().isOk());
        postJson(finderToken,path(id,"complete"),Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        postJson(finderToken,path(id,"complete"),Map.of()).andExpect(status().isOk());
        entities.flush(); entities.clear();
        ReturnRequest saved = returns.findById(id).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(ReturnStatus.COMPLETED);
        assertThat(saved.getQrUsedAt()).isNotNull();
        assertThat(found.findById(item.getId()).orElseThrow().getStatus()).isEqualTo(FoundItemStatus.RETURNED);
        assertThat(lost.findById(linked.getId()).orElseThrow().getStatus()).isEqualTo(LostItemStatus.RETURNED);
        assertThat(experience.total(finder.getId())).isEqualTo(50);
        assertThat(experience.total(requester.getId())).isZero();
        mvc.perform(get("/api/me/activity").header("Authorization","Bearer " + finderToken)).andExpect(status().isOk())
            .andExpect(jsonPath("$.profile.xp").value(50)).andExpect(jsonPath("$.profile.returnedCount").value(1))
            .andExpect(jsonPath("$.requests[0].status").value("COMPLETED"));
    }
    @Test void doesNotExposeAnswerOrQrToOtherUsers() throws Exception {
        Long id = create(); verify(id); approve(id);
        mvc.perform(get("/api/found-items/" + item.getId())).andExpect(status().isOk())
            .andExpect(jsonPath("$.ownershipAnswer").doesNotExist()).andExpect(jsonPath("$.ownershipAnswerHash").doesNotExist());
        mvc.perform(get("/api/returns/" + id).header("Authorization","Bearer " + finderToken))
            .andExpect(status().isOk()).andExpect(jsonPath("$.qrToken").isEmpty());
        mvc.perform(get("/api/returns/" + id).header("Authorization","Bearer " + strangerToken)).andExpect(status().isForbidden());
        mvc.perform(get("/api/me/activity").header("Authorization","Bearer " + strangerToken))
            .andExpect(status().isOk()).andExpect(jsonPath("$.requests").isEmpty()).andExpect(jsonPath("$.notifications").isEmpty());
    }
    @Test void cannotSkipStepsOrApproveOwnRequest() throws Exception {
        Long id = create();
        postJson(requesterToken,path(id,"approve"),Map.of()).andExpect(status().isForbidden());
        postJson(strangerToken,path(id,"complete"),Map.of()).andExpect(status().isForbidden());
        postJson(finderToken,path(id,"complete"),Map.of()).andExpect(status().isConflict());
        postJson(finderToken,path(id,"approve"),Map.of()).andExpect(status().isConflict());
        postJson(finderToken,path(id,"verify-owner"),Map.of("answer","파란색")).andExpect(status().isForbidden());
        postJson(requesterToken,path(id,"verify-owner"),Map.of("answer","wrong")).andExpect(status().isBadRequest());
        assertThat(returns.findById(id).orElseThrow().getStatus()).isEqualTo(ReturnStatus.PENDING);
        assertThat(experience.count()).isZero();
    }
    @Test void qrMustMatchAndCannotBeReusedOrVerifiedByRequester() throws Exception {
        Long id = create(); verify(id); approve(id); String token = qr(id);
        postJson(requesterToken,path(id,"verify-qr"),Map.of("token",token)).andExpect(status().isForbidden());
        postJson(finderToken,path(id,"verify-qr"),Map.of("token","wrong")).andExpect(status().isBadRequest());
        postJson(finderToken,path(id,"verify-qr"),Map.of("token",token)).andExpect(status().isOk());
        postJson(finderToken,path(id,"verify-qr"),Map.of("token",token)).andExpect(status().isConflict());
    }
    @Test void expiredQrRequiresRenewalAndOldQrStopsWorking() throws Exception {
        Long id = create(); verify(id); approve(id); String old = qr(id);
        ReturnRequest request = returns.findById(id).orElseThrow(); request.issueQr(old, Instant.now().minusSeconds(1)); entities.flush();
        postJson(finderToken,path(id,"verify-qr"),Map.of("token",old)).andExpect(status().isConflict());
        postJson(finderToken,path(id,"renew-qr"),Map.of()).andExpect(status().isOk());
        assertThat(qr(id)).isNotEqualTo(old);
        postJson(finderToken,path(id,"verify-qr"),Map.of("token",old)).andExpect(status().isBadRequest());
        postJson(finderToken,path(id,"verify-qr"),Map.of("token",qr(id))).andExpect(status().isOk());
    }
    @Test void duplicateRequestIsIdempotentButCompetingRequestIsRejected() throws Exception {
        Long id = create();
        assertThat(create()).isEqualTo(id);
        postJson(strangerToken,"/api/returns",Map.of("foundItemId",item.getId())).andExpect(status().isConflict());
        assertThat(returns.count()).isEqualTo(1);
    }
    @Test void requesterCannotLinkSomeoneElsesLostItem() throws Exception {
        LostItem other = lost.saveAndFlush(new LostItem(stranger,"다른 지갑","지갑","검정","다른 회원의 지갑입니다",
                LocalDate.now(),"서울","서울역",null,LostItemStatus.LOST));
        postJson(requesterToken,"/api/returns",Map.of("foundItemId",item.getId(),"lostItemId",other.getId())).andExpect(status().isForbidden());
        assertThat(returns.count()).isZero();
    }
    @Test void rejectsSelfClaimAndAllowsNewRequestAfterRejection() throws Exception {
        postJson(finderToken,"/api/returns",Map.of("foundItemId",item.getId())).andExpect(status().isConflict());
        Long id = create();
        postJson(finderToken,path(id,"reject"),Map.of()).andExpect(status().isOk());
        postJson(requesterToken,path(id,"verify-owner"),Map.of("answer","파란색")).andExpect(status().isConflict());
        assertThat(create()).isNotEqualTo(id);
        assertThat(experience.count()).isZero();
    }
    @Test void ownershipSetupRequiresFinderAndCannotChangeDuringRequest() throws Exception {
        postJson(strangerToken,"/api/found-items/" + item.getId() + "/ownership",Map.of("question","특징은?","answer","비공개")).andExpect(status().isForbidden());
        create();
        postJson(finderToken,"/api/found-items/" + item.getId() + "/ownership",Map.of("question","특징은?","answer","비공개")).andExpect(status().isConflict());
    }
    @Test void registrationAwardsAndNotificationsArePersistedAndReadPerUser() throws Exception {
        Map<String,Object> body = Map.of("title","테스트 습득물","category","지갑","color","검정","description","충분히 긴 물품 설명입니다",
                "foundDate",LocalDate.now().toString(),"region","서울","location","서울역","ownershipQuestion","내부 문양은?","ownershipAnswer","가".repeat(90));
        Long id = read(postJson(finderToken,"/api/found-items",body).andExpect(status().isCreated())
                .andExpect(jsonPath("$.ownershipConfigured").value(true))).get("id").asLong();
        entities.flush(); entities.clear();
        FoundItem saved = found.findById(id).orElseThrow();
        assertThat(saved.ownershipAnswerHash()).startsWith("$2").doesNotContain("가");
        assertThat(proof.matches("가".repeat(90),saved.ownershipAnswerHash())).isTrue();
        assertThat(experience.total(finder.getId())).isEqualTo(10);
        mvc.perform(get("/api/me/activity").header("Authorization","Bearer " + finderToken))
            .andExpect(status().isOk()).andExpect(jsonPath("$.notifications[0].read").value(false));
        postJson(finderToken,"/api/me/activity/read-all",Map.of()).andExpect(status().isOk());
        entities.flush(); entities.clear();
        mvc.perform(get("/api/me/activity").header("Authorization","Bearer " + finderToken))
            .andExpect(status().isOk()).andExpect(jsonPath("$.notifications[0].read").value(true));
    }
    @Test void requiresLogin() throws Exception {
        postJson(null,"/api/returns",Map.of("foundItemId",item.getId())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me/activity")).andExpect(status().isUnauthorized());
    }
}

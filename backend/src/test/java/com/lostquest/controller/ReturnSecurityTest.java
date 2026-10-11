package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.OwnershipProof;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Return workflow hardening: admin-only completion, access control, QR storage/binding and finished requests. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ReturnSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired FoundItemRepository found;
    @Autowired ReturnRequestRepository returns;
    @Autowired ExperienceEventRepository experience;
    @Autowired JwtTokenProvider tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired OwnershipProof proof;
    @Autowired EntityManager entities;

    User requester, finder, stranger, admin;
    String requesterToken, finderToken, strangerToken, adminToken;
    FoundItem item;

    @BeforeEach
    void setUp() {
        String hash = passwords.encode("Quest1234!");
        requester = users.save(new User("sec-owner@lostquest.test", hash, "소유자", UserRole.USER));
        finder = users.save(new User("sec-finder@lostquest.test", hash, "습득자", UserRole.USER));
        stranger = users.save(new User("sec-stranger@lostquest.test", hash, "다른회원", UserRole.USER));
        admin = users.save(new User("sec-admin@lostquest.test", hash, "관리자", UserRole.ADMIN));
        requesterToken = tokens.issueAccessToken(requester).value();
        finderToken = tokens.issueAccessToken(finder).value();
        strangerToken = tokens.issueAccessToken(stranger).value();
        adminToken = tokens.issueAccessToken(admin).value();
        item = foundItem("검은색 지갑");
    }

    private FoundItem foundItem(String title) {
        FoundItem f = new FoundItem(finder, title, "지갑", "검정", "안쪽에 스티커가 있는 지갑입니다", LocalDate.now(), "서울", "서울역",
                null, FoundItemStatus.STORED);
        f.configureOwnership("안쪽 스티커 색상은?", proof.encode("파란색"));
        return found.saveAndFlush(f);
    }

    private ResultActions post(String token, String path, Object body) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        return mvc.perform(request);
    }

    private JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsByteArray());
    }

    private String path(Long id, String action) {
        return "/api/returns/" + id + "/" + action;
    }

    private Long create(FoundItem f) throws Exception {
        return read(post(requesterToken, "/api/returns", Map.of("foundItemId", f.getId())).andExpect(status().isCreated())).get("id").asLong();
    }

    private Long approved(FoundItem f) throws Exception {
        Long id = create(f);
        post(requesterToken, path(id, "verify-owner"), Map.of("answer", "파란색")).andExpect(status().isOk());
        post(finderToken, path(id, "approve"), Map.of()).andExpect(status().isOk());
        return id;
    }

    private String qr(Long id) throws Exception {
        return read(mvc.perform(get("/api/returns/" + id).header("Authorization", "Bearer " + requesterToken)).andExpect(status().isOk()))
                .get("qrToken").asText();
    }

    private Long qrVerified(FoundItem f) throws Exception {
        Long id = approved(f);
        post(finderToken, path(id, "verify-qr"), Map.of("token", qr(id))).andExpect(status().isOk());
        return id;
    }

    @Test
    @DisplayName("일반 USER(습득자·요청자·제3자)의 반환 완료 → 403, 상태·XP 변화 없음")
    void normalUsersCannotComplete() throws Exception {
        Long id = qrVerified(item);
        for (String token : new String[] {finderToken, requesterToken, strangerToken}) {
            post(token, path(id, "complete"), Map.of()).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
        entities.flush(); entities.clear();
        assertThat(returns.findById(id).orElseThrow().getStatus()).isEqualTo(ReturnStatus.QR_VERIFIED);
        assertThat(found.findById(item.getId()).orElseThrow().getStatus()).isEqualTo(FoundItemStatus.STORED);
        assertThat(experience.count()).isZero();
    }

    @Test
    @DisplayName("ADMIN 반환 완료 성공: 물품 RETURNED, 습득자에게만 50 XP, 재호출은 200이지만 추가 지급 없음")
    void adminCompletesOnceAndFinderIsRewarded() throws Exception {
        Long id = qrVerified(item);
        post(adminToken, path(id, "complete"), Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        post(adminToken, path(id, "complete"), Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        entities.flush(); entities.clear();
        assertThat(found.findById(item.getId()).orElseThrow().getStatus()).isEqualTo(FoundItemStatus.RETURNED);
        assertThat(experience.total(finder.getId())).isEqualTo(50);
        assertThat(experience.total(requester.getId())).isZero();
        assertThat(experience.total(admin.getId())).isZero();
    }

    @Test
    @DisplayName("권한은 DB 역할 기준: ADMIN 토큰이라도 DB에서 USER로 바뀌면 403")
    void adminRoleIsReadFromDatabase() throws Exception {
        Long id = qrVerified(item);
        entities.createQuery("update User u set u.role = :role where u.id = :id")
                .setParameter("role", UserRole.USER).setParameter("id", admin.getId()).executeUpdate();
        entities.clear();
        post(adminToken, path(id, "complete"), Map.of()).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("완료된 반환은 반려·승인·QR·소유자 확인 등 상태 변경 불가 (409)")
    void completedRequestCannotChange() throws Exception {
        Long id = qrVerified(item);
        post(adminToken, path(id, "complete"), Map.of()).andExpect(status().isOk());
        post(finderToken, path(id, "reject"), Map.of()).andExpect(status().isConflict());
        post(adminToken, path(id, "reject"), Map.of()).andExpect(status().isConflict());
        post(finderToken, path(id, "approve"), Map.of()).andExpect(status().isConflict());
        post(finderToken, path(id, "renew-qr"), Map.of()).andExpect(status().isConflict());
        post(finderToken, path(id, "verify-qr"), Map.of("token", "anything")).andExpect(status().isConflict());
        post(requesterToken, path(id, "verify-owner"), Map.of("answer", "파란색")).andExpect(status().isConflict());
        entities.flush(); entities.clear();
        assertThat(returns.findById(id).orElseThrow().getStatus()).isEqualTo(ReturnStatus.COMPLETED);
        assertThat(experience.total(finder.getId())).isEqualTo(50);
    }

    @Test
    @DisplayName("타인 요청 접근 차단: 조회·소유자 확인·승인·QR 검증·재발급·반려 → 403")
    void strangersAreBlocked() throws Exception {
        Long id = approved(item);
        mvc.perform(get("/api/returns/" + id).header("Authorization", "Bearer " + strangerToken)).andExpect(status().isForbidden());
        post(strangerToken, path(id, "verify-owner"), Map.of("answer", "파란색")).andExpect(status().isForbidden());
        post(strangerToken, path(id, "approve"), Map.of()).andExpect(status().isForbidden());
        post(strangerToken, path(id, "verify-qr"), Map.of("token", qr(id))).andExpect(status().isForbidden());
        post(strangerToken, path(id, "renew-qr"), Map.of()).andExpect(status().isForbidden());
        post(strangerToken, path(id, "reject"), Map.of()).andExpect(status().isForbidden());
        // The finder never sees the requester's QR; the admin does not either.
        mvc.perform(get("/api/returns/" + id).header("Authorization", "Bearer " + finderToken)).andExpect(jsonPath("$.qrToken").isEmpty());
        mvc.perform(get("/api/returns/" + id).header("Authorization", "Bearer " + adminToken)).andExpect(jsonPath("$.qrToken").isEmpty());
    }

    @Test
    @DisplayName("QR 원문은 DB에 저장되지 않고(nonce만 저장), 새로고침해도 같은 QR, 재발급 시 이전 QR 무효")
    void qrTokenIsNotStoredAndIsStableUntilRenewed() throws Exception {
        Long id = approved(item);
        String token = qr(id);
        assertThat(token).hasSize(43);
        assertThat(qr(id)).isEqualTo(token);
        entities.flush(); entities.clear();
        ReturnRequest stored = returns.findById(id).orElseThrow();
        assertThat(stored.getQrToken()).isNull();
        assertThat(stored.getQrNonce()).isNotBlank().isNotEqualTo(token);

        post(finderToken, path(id, "renew-qr"), Map.of()).andExpect(status().isOk());
        String renewed = qr(id);
        assertThat(renewed).isNotEqualTo(token);
        post(finderToken, path(id, "verify-qr"), Map.of("token", token)).andExpect(status().isBadRequest());
        post(finderToken, path(id, "verify-qr"), Map.of("token", "LOSTQUEST:RETURN:" + id + ":" + renewed)).andExpect(status().isOk());
        post(finderToken, path(id, "verify-qr"), Map.of("token", renewed)).andExpect(status().isConflict()); // single use
        entities.flush(); entities.clear();
        ReturnRequest used = returns.findById(id).orElseThrow();
        assertThat(used.getQrNonce()).isNull();
        assertThat(used.getQrUsedAt()).isNotNull();
    }

    @Test
    @DisplayName("다른 반환 요청의 QR(또는 다른 id 접두어)은 사용할 수 없음, 오류 메시지에 QR 원문 미포함")
    void qrIsBoundToItsRequest() throws Exception {
        Long first = approved(item);
        Long second = approved(foundItem("갈색 지갑"));
        String secondToken = qr(second);
        String body = post(finderToken, path(first, "verify-qr"), Map.of("token", secondToken)).andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain(secondToken).doesNotContain(qr(first));
        post(finderToken, path(first, "verify-qr"), Map.of("token", "LOSTQUEST:RETURN:" + second + ":" + secondToken)).andExpect(status().isBadRequest());
        post(finderToken, path(first, "verify-qr"), Map.of("token", "LOSTQUEST:RETURN:" + second + ":" + qr(first))).andExpect(status().isBadRequest());
        post(finderToken, path(second, "verify-qr"), Map.of("token", secondToken)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("만료된 QR은 409, 재발급 후 새 QR만 사용 가능")
    void expiredQr() throws Exception {
        Long id = approved(item);
        String token = qr(id);
        entities.flush();
        entities.createQuery("update ReturnRequest r set r.qrExpiresAt = :t where r.id = :id")
                .setParameter("t", Instant.now().minusSeconds(1)).setParameter("id", id).executeUpdate();
        entities.clear();
        post(finderToken, path(id, "verify-qr"), Map.of("token", token)).andExpect(status().isConflict());
        post(finderToken, path(id, "renew-qr"), Map.of()).andExpect(status().isOk());
        post(finderToken, path(id, "verify-qr"), Map.of("token", token)).andExpect(status().isBadRequest());
        post(finderToken, path(id, "verify-qr"), Map.of("token", qr(id))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("기존 데이터 호환: 강화 전 원문 QR(qr_token)이 있는 진행 중 요청은 그대로 표시·검증되고, 사용 후 원문이 지워짐")
    void legacyRawQrStillWorks() throws Exception {
        Long id = approved(item);
        entities.flush();
        entities.createQuery("update ReturnRequest r set r.qrNonce = null, r.qrToken = :t where r.id = :id")
                .setParameter("t", "legacy-raw-token-value").setParameter("id", id).executeUpdate();
        entities.clear();
        assertThat(qr(id)).isEqualTo("legacy-raw-token-value");
        post(finderToken, path(id, "verify-qr"), Map.of("token", "wrong")).andExpect(status().isBadRequest());
        post(finderToken, path(id, "verify-qr"), Map.of("token", "legacy-raw-token-value")).andExpect(status().isOk());
        entities.flush(); entities.clear();
        assertThat(returns.findById(id).orElseThrow().getQrToken()).isNull();
    }

    @Test
    @DisplayName("기존 데이터 호환: 원문 QR 요청을 재발급하면 원문은 지워지고 nonce 방식으로 전환")
    void legacyRawQrIsReplacedOnRenewal() throws Exception {
        Long id = approved(item);
        entities.flush();
        entities.createQuery("update ReturnRequest r set r.qrNonce = null, r.qrToken = :t where r.id = :id")
                .setParameter("t", "legacy-raw-token-value").setParameter("id", id).executeUpdate();
        entities.clear();
        post(finderToken, path(id, "renew-qr"), Map.of()).andExpect(status().isOk());
        entities.flush(); entities.clear();
        ReturnRequest renewed = returns.findById(id).orElseThrow();
        assertThat(renewed.getQrToken()).isNull();
        assertThat(renewed.getQrNonce()).isNotBlank();
        post(finderToken, path(id, "verify-qr"), Map.of("token", "legacy-raw-token-value")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("비공개 특징: 응답에 정답·해시 없음, 오답 메시지에 정답 정보 없음, 남은 횟수 표시")
    void ownershipAnswerIsNeverExposed() throws Exception {
        Long id = create(item);
        String body = post(requesterToken, path(id, "verify-owner"), Map.of("answer", "빨간색")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("answer")).andReturn().getResponse().getContentAsString();
        assertThat(body).contains("남은 시도: 4회").doesNotContain("파란").doesNotContain("$2");
        String detail = mvc.perform(get("/api/returns/" + id).header("Authorization", "Bearer " + requesterToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ownershipAttemptsRemaining").value(4))
                .andExpect(jsonPath("$.ownershipLocked").value(false)).andReturn().getResponse().getContentAsString();
        assertThat(detail).doesNotContain("파란").doesNotContain("ownershipAnswerHash").doesNotContain("$2a$");
    }

    @Test
    @DisplayName("정상 반환 전체 시나리오: 요청 → 소유자 확인 → 승인 → QR 검증 → ADMIN 완료")
    void fullHappyPath() throws Exception {
        Long id = create(item);
        post(requesterToken, path(id, "verify-owner"), Map.of("answer", " 파 란 색 ")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OWNER_VERIFIED"));
        post(finderToken, path(id, "approve"), Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        post(finderToken, path(id, "verify-qr"), Map.of("token", "LOSTQUEST:RETURN:" + id + ":" + qr(id))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QR_VERIFIED"));
        post(adminToken, path(id, "complete"), Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        mvc.perform(get("/api/me/activity").header("Authorization", "Bearer " + finderToken)).andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.xp").value(50)).andExpect(jsonPath("$.profile.returnedCount").value(1));
    }
}

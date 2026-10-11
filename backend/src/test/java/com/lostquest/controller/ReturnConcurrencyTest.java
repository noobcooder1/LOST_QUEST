package com.lostquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.OwnershipProof;
import org.junit.jupiter.api.AfterEach;
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
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.util.ArrayList;
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

/**
 * Committing (non-@Transactional) tests: the ownership-attempt limit must survive the failed request's transaction
 * (i.e. it is really in the database, so a restart keeps it), and concurrent calls must not bypass the row lock.
 * Uses its own in-memory H2 database with a longer lock timeout, because the competing calls wait on that lock.
 * Set LOSTQUEST_RETURN_CONCURRENCY_DB_URL (plus SPRING_DATASOURCE_* driver/credentials) to run it on a real MySQL test DB.
 */
@SpringBootTest(properties = "spring.datasource.url=${LOSTQUEST_RETURN_CONCURRENCY_DB_URL:jdbc:h2:mem:lostquest_returns_concurrency;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=30000}")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReturnConcurrencyTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired FoundItemRepository found;
    @Autowired LostItemRepository lost;
    @Autowired ReturnRequestRepository returns;
    @Autowired ExperienceEventRepository experience;
    @Autowired ActivityNotificationRepository notifications;
    @Autowired MatchNotificationRepository matchNotifications;
    @Autowired JwtTokenProvider tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired OwnershipProof proof;

    User requester, finder, admin;
    String requesterToken, finderToken, adminToken;
    FoundItem item;

    @BeforeEach
    void setUp() {
        cleanUp();
        String hash = passwords.encode("Quest1234!");
        requester = users.save(new User("con-owner@lostquest.test", hash, "소유자", UserRole.USER));
        finder = users.save(new User("con-finder@lostquest.test", hash, "습득자", UserRole.USER));
        admin = users.save(new User("con-admin@lostquest.test", hash, "관리자", UserRole.ADMIN));
        requesterToken = tokens.issueAccessToken(requester).value();
        finderToken = tokens.issueAccessToken(finder).value();
        adminToken = tokens.issueAccessToken(admin).value();
        FoundItem f = new FoundItem(finder, "검은색 지갑", "지갑", "검정", "안쪽에 스티커가 있는 지갑입니다", LocalDate.now(), "서울", "서울역",
                null, FoundItemStatus.STORED);
        f.configureOwnership("안쪽 스티커 색상은?", proof.encode("파란색"));
        item = found.saveAndFlush(f);
    }

    @AfterEach
    void cleanUp() {
        returns.deleteAll();
        experience.deleteAll();
        notifications.deleteAll();
        matchNotifications.deleteAll();
        found.deleteAll();
        lost.deleteAll();
        users.deleteAll();
    }

    private MvcResult call(String token, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body))).andReturn();
    }

    private String path(Long id, String action) {
        return "/api/returns/" + id + "/" + action;
    }

    private Long create() throws Exception {
        MvcResult result = call(requesterToken, "/api/returns", Map.of("foundItemId", item.getId()));
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return json.readTree(result.getResponse().getContentAsByteArray()).get("id").asLong();
    }

    private Long approved() throws Exception {
        Long id = create();
        assertThat(call(requesterToken, path(id, "verify-owner"), Map.of("answer", "파란색")).getResponse().getStatus()).isEqualTo(200);
        assertThat(call(finderToken, path(id, "approve"), Map.of()).getResponse().getStatus()).isEqualTo(200);
        return id;
    }

    private String qr(Long id) throws Exception {
        MvcResult result = mvc.perform(get("/api/returns/" + id).header("Authorization", "Bearer " + requesterToken)).andReturn();
        return json.readTree(result.getResponse().getContentAsByteArray()).get("qrToken").asText();
    }

    /** Runs the same call from {@code threads} threads at once and returns the HTTP statuses. */
    private List<Integer> concurrently(int threads, Callable<Integer> call) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> futures = new ArrayList<>();
        try (ExecutorService executor = Executors.newFixedThreadPool(threads)) {
            for (int i = 0; i < threads; i++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return call.call();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : futures) statuses.add(future.get());
            return statuses;
        }
    }

    @Test
    @DisplayName("오답 5회 후 차단: 실패 횟수는 실패한 요청과 함께 롤백되지 않고 DB에 남으며, 정답도 거부(409), 습득자에게 알림")
    void wrongAnswersAreLimitedAndPersisted() throws Exception {
        Long id = create();
        for (int i = 1; i <= ReturnRequest.MAX_OWNERSHIP_ATTEMPTS; i++) {
            MvcResult result = call(requesterToken, path(id, "verify-owner"), Map.of("answer", "틀린답" + i));
            assertThat(result.getResponse().getStatus()).isEqualTo(400);
            // Committed after every failed call (a fresh read sees it, as would a restarted server).
            assertThat(returns.findById(id).orElseThrow().getOwnershipFailedAttempts()).isEqualTo(i);
        }
        MvcResult blocked = call(requesterToken, path(id, "verify-owner"), Map.of("answer", "파란색"));
        assertThat(blocked.getResponse().getStatus()).isEqualTo(409);
        assertThat(blocked.getResponse().getContentAsString()).doesNotContain("파란");
        ReturnRequest stored = returns.findById(id).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(ReturnStatus.PENDING);
        assertThat(stored.getOwnershipFailedAttempts()).isEqualTo(ReturnRequest.MAX_OWNERSHIP_ATTEMPTS);
        assertThat(notifications.findTop100ByUser_IdOrderByIdDesc(finder.getId()))
                .anySatisfy(n -> assertThat(n.getTitle()).isEqualTo("소유자 확인 시도 초과"));

        // Safe retry: only after the finder rejects can the owner start a new request with a fresh limit.
        assertThat(call(finderToken, path(id, "reject"), Map.of()).getResponse().getStatus()).isEqualTo(200);
        Long retry = create();
        assertThat(retry).isNotEqualTo(id);
        assertThat(call(requesterToken, path(retry, "verify-owner"), Map.of("answer", "파란색")).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("동시 오답 10건: 정확히 5건만 판정(400), 나머지는 차단(409), 실패 횟수는 5를 넘지 않음")
    void concurrentGuessesCannotBypassTheLimit() throws Exception {
        Long id = create();
        List<Integer> statuses = concurrently(10, () -> call(requesterToken, path(id, "verify-owner"), Map.of("answer", "추측")).getResponse().getStatus());
        assertThat(statuses).containsOnly(400, 409);
        assertThat(statuses.stream().filter(s -> s == 400).count()).isEqualTo(ReturnRequest.MAX_OWNERSHIP_ATTEMPTS);
        assertThat(returns.findById(id).orElseThrow().getOwnershipFailedAttempts()).isEqualTo(ReturnRequest.MAX_OWNERSHIP_ATTEMPTS);
    }

    @Test
    @DisplayName("같은 QR 동시 검증 8건: 정확히 1건만 성공, 나머지는 409")
    void concurrentQrVerificationSucceedsOnce() throws Exception {
        Long id = approved();
        String token = qr(id);
        List<Integer> statuses = concurrently(8, () -> call(finderToken, path(id, "verify-qr"), Map.of("token", token)).getResponse().getStatus());
        assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1);
        assertThat(statuses).containsOnly(200, 409);
        assertThat(returns.findById(id).orElseThrow().getStatus()).isEqualTo(ReturnStatus.QR_VERIFIED);
    }

    @Test
    @DisplayName("ADMIN 반환 완료 동시 호출 6건: 모두 같은 완료 결과(200)지만 XP 이벤트는 1건(50 XP)")
    void concurrentCompletionAwardsOnce() throws Exception {
        Long id = approved();
        assertThat(call(finderToken, path(id, "verify-qr"), Map.of("token", qr(id))).getResponse().getStatus()).isEqualTo(200);
        List<Integer> statuses = concurrently(6, () -> call(adminToken, path(id, "complete"), Map.of()).getResponse().getStatus());
        assertThat(statuses).containsOnly(200);
        assertThat(experience.total(finder.getId())).isEqualTo(50);
        assertThat(experience.count()).isEqualTo(1);
        assertThat(found.findById(item.getId()).orElseThrow().getStatus()).isEqualTo(FoundItemStatus.RETURNED);
        assertThat(returns.findById(id).orElseThrow().getStatus()).isEqualTo(ReturnStatus.COMPLETED);
    }
}

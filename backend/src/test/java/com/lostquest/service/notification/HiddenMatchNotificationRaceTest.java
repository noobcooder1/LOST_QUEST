package com.lostquest.service.notification;

import com.lostquest.entity.*;
import com.lostquest.repository.*;
import com.lostquest.service.CommunityService;
import com.lostquest.service.matching.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;

/** H2 only: real transactions/row locks, with database evidence that the writer is blocked. */
@SpringBootTest
@ActiveProfiles("test")
class HiddenMatchNotificationRaceTest {
    @Autowired UserRepository users;
    @Autowired LostItemRepository lost;
    @Autowired FoundItemRepository found;
    @Autowired CommunityReportRepository reports;
    @Autowired MatchNotificationRepository notifications;
    @Autowired MatchNotificationWriter writer;
    @Autowired CommunityService community;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwords;
    User owner, finder, admin;
    LostItem target;
    FoundItem candidate;
    CommunityReport report;

    @BeforeEach void setup() {
        String key = UUID.randomUUID().toString();
        String hash = passwords.encode("Quest1234!");
        owner = users.save(new User(key + "-owner@test.example", hash, "주인", UserRole.USER));
        finder = users.save(new User(key + "-finder@test.example", hash, "습득자", UserRole.USER));
        admin = users.save(new User(key + "-admin@test.example", hash, "관리자", UserRole.ADMIN));
        target = lost.saveAndFlush(new LostItem(owner, "검정 지갑", "지갑", "검정", "테스트 분실물",
                LocalDate.now(), "서울", "서울역", null, LostItemStatus.LOST));
        candidate = found.saveAndFlush(new FoundItem(finder, "검정 지갑", "지갑", "검정", "테스트 습득물",
                LocalDate.now(), "서울", "서울역", null, FoundItemStatus.STORED));
    }
    @AfterEach void cleanup() {
        if (target == null) return;
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            notifications.deleteByLostItem_Id(target.getId());
            if (report != null) reports.deleteById(report.getId());
            found.deleteById(candidate.getId()); lost.deleteById(target.getId());
            users.deleteById(admin.getId()); users.deleteById(finder.getId()); users.deleteById(owner.getId());
        });
    }
    MatchNotificationWriter.NewNotification snapshot() {
        return new MatchNotificationWriter.NewNotification(owner.getId(), target.getId(), MatchSource.LOST_QUEST,
                "LOST_QUEST:" + candidate.getId(), candidate.getId(), null, null, candidate.getTitle(),
                candidate.getFoundDate(), 80, 100, MatchTarget.of(target), MatchingService.toCandidate(candidate));
    }
    void report(String type) {
        report = reports.saveAndFlush(new CommunityReport(CommunityItemType.fromPath(type),
                type.equals("lost") ? target.getId() : candidate.getId(), "검정 지갑", owner, "검증용 신고"));
    }
    static void await(CountDownLatch latch) {
        try { if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Transaction barrier timed out"); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
    }
    void awaitBlockedWriter() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            Integer blocked = jdbc.queryForObject("select count(*) from information_schema.sessions " +
                    "where blocker_id is not null and upper(executing_statement) like '%FOR UPDATE%'", Integer.class);
            if (blocked != null && blocked > 0) return;
            Thread.sleep(10);
        }
        throw new AssertionError("The notification writer never waited on the hiding transaction's DB row lock");
    }
    @ParameterizedTest @ValueSource(strings = {"lost", "found"})
    void hidingOverlapsStaleNotificationWriterAndPreventsReinsert(String type) throws Exception {
        var stale = snapshot(); // Matching completed while both posts were visible.
        report(type);
        var hidden = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<?> hiding = null;
        Future<Boolean> inserting = null;
        try {
            hiding = executor.submit(() -> new TransactionTemplate(manager).executeWithoutResult(tx -> {
                community.hide(admin.getId().toString(), report.getId());
                hidden.countDown(); await(release); // Hold the actual hide transaction open.
            }));
            await(hidden);
            inserting = executor.submit(() -> writer.insertIfAbsent(stale));
            awaitBlockedWriter();
            assertThat(inserting.isDone()).isFalse();
            release.countDown();
            hiding.get(10, TimeUnit.SECONDS);
            assertThat(inserting.get(10, TimeUnit.SECONDS)).isFalse();
            assertThat(notifications.existsByLostItem_IdAndCandidateKey(target.getId(), stale.candidateKey())).isFalse();
            assertInvisible();
        } finally {
            release.countDown();
            executor.shutdown();
            assertThat(executor.awaitTermination(15, TimeUnit.SECONDS)).isTrue();
        }
    }
    @ParameterizedTest @ValueSource(strings = {"lost", "found", "police-lost"})
    void staleRowsAreExcludedFromListDetailAndUnreadCount(String type) {
        boolean police = type.equals("police-lost");
        var saved = notifications.saveAndFlush(new MatchNotification(owner, target,
                police ? MatchSource.POLICE : MatchSource.LOST_QUEST, police ? "POLICE:TEST-1" : "LOST_QUEST:" + candidate.getId(),
                police ? null : candidate.getId(), police ? "TEST" : null, police ? 1 : null,
                "검정 지갑", LocalDate.now(), 80, 100));
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            if (type.equals("found")) found.findLocked(candidate.getId()).orElseThrow().hide();
            else lost.findLocked(target.getId()).orElseThrow().hide();
        }); // Deliberately leave the old row to exercise the query's defensive boundary.
        assertThat(notifications.findForUser(saved.getId(), owner.getId())).isEmpty();
        assertInvisible();
    }
    void assertInvisible() {
        assertThat(notifications.findRecentForUser(owner.getId(), PageRequest.of(0, 20))).isEmpty();
        assertThat(notifications.countByUser_IdAndReadAtIsNull(owner.getId())).isZero();
    }
}

package com.lostquest.service.notification;

import com.lostquest.dto.MatchNotificationListResponse;
import com.lostquest.dto.MatchNotificationRefreshResponse;
import com.lostquest.dto.MatchNotificationResponse;
import com.lostquest.dto.UnreadCountResponse;
import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.entity.MatchNotification;
import com.lostquest.entity.User;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.MatchNotificationRepository;
import com.lostquest.service.CurrentUserReader;
import com.lostquest.service.matching.MatchCandidate;
import com.lostquest.service.matching.MatchSource;
import com.lostquest.service.matching.MatchTarget;
import com.lostquest.service.matching.MatchingEngine;
import com.lostquest.service.matching.MatchingService;
import com.lostquest.service.matching.MatchingService.MatchRun;
import com.lostquest.service.matching.ScoredMatch;
import com.lostquest.service.matching.SourceResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;

/**
 * In-app "new match" notifications for lost-item owners. Scores always come from the existing matching code
 * ({@link MatchingService#run} / {@link MatchingEngine}); nothing is re-implemented here. Notifications are created
 * at two points, without a background scheduler:
 * <ul>
 *   <li>after a LOST QUEST found item is registered (after commit): the new item is scored against the open lost
 *       items it could belong to, LOST QUEST data only, no 경찰청 call;</li>
 *   <li>on {@link #refresh}: the caller's recent open lost items are matched again (LOST QUEST + 경찰청, with the
 *       matching API's per-source fault isolation) and new strong candidates are recorded.</li>
 * </ul>
 * The (lost item, candidate) unique constraint makes repeated or concurrent runs create each notification once.
 */
@Service
public class MatchNotificationService {

    private static final Logger log = LoggerFactory.getLogger(MatchNotificationService.class);
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    /** 경찰청 습득물 관리번호 shape (same rule as the frontend detail route). */
    private static final Pattern POLICE_ATC_ID = Pattern.compile("F\\d{16}");
    private static final Pattern CONTROL_CHARS = Pattern.compile("\\p{Cntrl}");

    /** Only strong candidates notify (e.g. category + color + date within 3 days = 73). Recommendations start at 40. */
    public static final int NOTIFY_MIN_SCORE = 70;
    /** Per refresh, only a lost item's best candidates are considered for notifications. */
    public static final int NOTIFY_TOP_N = 5;
    /** Lost items lost earlier than this are no longer refreshed (their candidate windows have passed). */
    public static final int REFRESH_LOOKBACK_DAYS = 30;
    /** Lost items re-matched per refresh, newest first; each may call the 경찰청 API up to 3 times. */
    public static final int MAX_REFRESH_LOST_ITEMS = 5;
    static final int MAX_PARALLEL_REFRESH = 2;
    /** Lost items scored against one newly registered found item. */
    static final int MAX_EVENT_TARGETS = 200;
    public static final int DEFAULT_LIST_LIMIT = 30;
    public static final int MAX_LIST_LIMIT = 100;

    private final MatchNotificationRepository notificationRepository;
    private final LostItemRepository lostItemRepository;
    private final FoundItemRepository foundItemRepository;
    private final CurrentUserReader currentUserReader;
    private final MatchingService matchingService;
    private final MatchingEngine engine;
    private final MatchNotificationWriter writer;
    private final MatchRefreshThrottle throttle;
    private final Clock clock;

    @Autowired
    public MatchNotificationService(MatchNotificationRepository notificationRepository, LostItemRepository lostItemRepository,
                                    FoundItemRepository foundItemRepository, CurrentUserReader currentUserReader,
                                    MatchingService matchingService, MatchingEngine engine, MatchNotificationWriter writer,
                                    MatchRefreshThrottle throttle) {
        this(notificationRepository, lostItemRepository, foundItemRepository, currentUserReader, matchingService, engine,
                writer, throttle, Clock.system(KOREA));
    }

    MatchNotificationService(MatchNotificationRepository notificationRepository, LostItemRepository lostItemRepository,
                             FoundItemRepository foundItemRepository, CurrentUserReader currentUserReader,
                             MatchingService matchingService, MatchingEngine engine, MatchNotificationWriter writer,
                             MatchRefreshThrottle throttle, Clock clock) {
        this.notificationRepository = notificationRepository;
        this.lostItemRepository = lostItemRepository;
        this.foundItemRepository = foundItemRepository;
        this.currentUserReader = currentUserReader;
        this.matchingService = matchingService;
        this.engine = engine;
        this.writer = writer;
        this.throttle = throttle;
        this.clock = clock;
    }

    // ---- Reading (always scoped to the authenticated user) ----

    @Transactional(readOnly = true)
    public MatchNotificationListResponse list(String authenticatedSubject, int limit) {
        User caller = currentUserReader.require(authenticatedSubject);
        int bounded = Math.max(1, Math.min(limit, MAX_LIST_LIMIT));
        List<MatchNotificationResponse> notifications = notificationRepository
                .findRecentForUser(caller.getId(), PageRequest.of(0, bounded)).stream()
                .map(MatchNotificationResponse::from).toList();
        return new MatchNotificationListResponse(notifications, notificationRepository.countByUser_IdAndReadAtIsNull(caller.getId()));
    }

    @Transactional(readOnly = true)
    public UnreadCountResponse unreadCount(String authenticatedSubject) {
        User caller = currentUserReader.require(authenticatedSubject);
        return new UnreadCountResponse(notificationRepository.countByUser_IdAndReadAtIsNull(caller.getId()));
    }

    /** Another user's notification id is answered exactly like a missing one (404), so ids cannot be probed. */
    @Transactional
    public MatchNotificationResponse markRead(String authenticatedSubject, Long notificationId) {
        User caller = currentUserReader.require(authenticatedSubject);
        MatchNotification notification = notificationRepository.findForUser(notificationId, caller.getId())
                .orElseThrow(() -> new ResourceNotFoundException("알림을 찾을 수 없습니다."));
        notification.markRead(now());
        return MatchNotificationResponse.from(notification);
    }

    @Transactional
    public UnreadCountResponse markAllRead(String authenticatedSubject) {
        User caller = currentUserReader.require(authenticatedSubject);
        notificationRepository.markAllRead(caller.getId(), now());
        return new UnreadCountResponse(notificationRepository.countByUser_IdAndReadAtIsNull(caller.getId()));
    }

    // ---- Creating ----

    /**
     * Re-matches the caller's open lost items lost within {@link #REFRESH_LOOKBACK_DAYS} days (newest
     * {@link #MAX_REFRESH_LOST_ITEMS}), each at most once per throttle interval. Not transactional: no DB
     * connection is held while the 경찰청 API is called.
     */
    public MatchNotificationRefreshResponse refresh(String authenticatedSubject) {
        User caller = currentUserReader.require(authenticatedSubject);
        LocalDate since = LocalDate.now(clock).minusDays(REFRESH_LOOKBACK_DAYS);
        List<LostItem> targets = lostItemRepository.findRecentOpenByOwner(caller.getId(), LostItemStatus.LOST, since,
                PageRequest.of(0, MAX_REFRESH_LOST_ITEMS));

        List<LostItem> due = new ArrayList<>();
        for (LostItem lostItem : targets) {
            if (throttle.tryAcquire(lostItem.getId())) {
                due.add(lostItem);
            }
        }
        int throttled = targets.size() - due.size();

        List<MatchRun> runs = new ArrayList<>();
        int failed = 0;
        int created = 0;
        Semaphore permits = new Semaphore(MAX_PARALLEL_REFRESH);
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<MatchRun>> futures = due.stream().map(lostItem -> executor.submit(() -> {
                permits.acquire();
                try {
                    return matchingService.run(lostItem, NOTIFY_TOP_N);
                } finally {
                    permits.release();
                }
            })).toList();
            for (int i = 0; i < due.size(); i++) {
                LostItem lostItem = due.get(i);
                try {
                    MatchRun run = futures.get(i).get();
                    runs.add(run);
                    for (ScoredMatch match : run.matches()) {
                        if (match.score() >= NOTIFY_MIN_SCORE && record(lostItem, match)) {
                            created++;
                        }
                    }
                } catch (ExecutionException ex) {
                    failed++;
                    throttle.release(lostItem.getId());
                    log.warn("Match notification refresh failed for a lost item: {}", ex.getCause().getClass().getSimpleName());
                }
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
        return new MatchNotificationRefreshResponse(runs.size(), throttled, failed, created,
                notificationRepository.countByUser_IdAndReadAtIsNull(caller.getId()), summarize(runs));
    }

    /**
     * A new LOST QUEST found item is scored against the open lost items whose matching window contains its found
     * date (the same window and engine as the matching API). Runs after the registration committed; any failure
     * here is logged and never affects the registration.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFoundItemRegistered(FoundItemRegisteredEvent event) {
        try {
            FoundItem found = foundItemRepository.findById(event.foundItemId()).orElse(null);
            if (found == null || found.getStatus() != FoundItemStatus.STORED || found.getFoundDate() == null) {
                return;
            }
            MatchCandidate candidate = MatchingService.toCandidate(found);
            List<LostItem> lostItems = lostItemRepository.findMatchTargets(LostItemStatus.LOST,
                    found.getFoundDate().minusDays(MatchingService.LOST_QUEST_WINDOW_DAYS), found.getFoundDate(),
                    event.finderId(), PageRequest.of(0, MAX_EVENT_TARGETS));
            int created = 0;
            for (LostItem lostItem : lostItems) {
                ScoredMatch match = engine.score(MatchTarget.of(lostItem), candidate);
                if (match.score() >= NOTIFY_MIN_SCORE && record(lostItem, match)) {
                    created++;
                }
            }
            log.debug("Match notifications for found item {}: {} created", event.foundItemId(), created);
        } catch (RuntimeException ex) {
            log.warn("Match notifications for a new found item failed: {}", ex.getClass().getSimpleName());
        }
    }

    /** Stores one notification unless it exists already; external values are validated first. */
    boolean record(LostItem lostItem, ScoredMatch match) {
        MatchCandidate candidate = match.candidate();
        if (!isTrustworthy(candidate)) {
            log.warn("Match notification skipped: candidate id failed validation ({})", candidate.source());
            return false;
        }
        MatchNotificationWriter.NewNotification notification = new MatchNotificationWriter.NewNotification(
                lostItem.getUser().getId(), lostItem.getId(), candidate.source(), candidate.key(),
                candidate.source() == MatchSource.LOST_QUEST ? candidate.foundItemId() : null,
                candidate.source() == MatchSource.POLICE ? candidate.atcId() : null,
                candidate.source() == MatchSource.POLICE ? candidate.fdSn() : null,
                cleanTitle(candidate.title()), candidate.foundDate(), match.score(), match.maxScore());
        try {
            return writer.insertIfAbsent(notification);
        } catch (DataIntegrityViolationException duplicate) {
            // A concurrent request inserted the same (lost item, candidate) first.
            return false;
        }
    }

    /** The key must be exactly what the ids imply, and 경찰청 ids must have the verified shape. */
    static boolean isTrustworthy(MatchCandidate candidate) {
        if (candidate.source() == MatchSource.LOST_QUEST) {
            return candidate.foundItemId() != null && candidate.foundItemId() > 0
                    && ("LOST_QUEST:" + candidate.foundItemId()).equals(candidate.key());
        }
        if (candidate.source() == MatchSource.POLICE) {
            return candidate.atcId() != null && POLICE_ATC_ID.matcher(candidate.atcId()).matches()
                    && candidate.fdSn() != null && candidate.fdSn() >= 1 && candidate.fdSn() <= 999
                    && ("POLICE:" + candidate.atcId() + "-" + candidate.fdSn()).equals(candidate.key());
        }
        return false;
    }

    static String cleanTitle(String title) {
        if (title == null) {
            return null;
        }
        String cleaned = CONTROL_CHARS.matcher(title).replaceAll(" ").strip();
        if (cleaned.isEmpty()) {
            return null;
        }
        return cleaned.length() > MatchNotification.TITLE_MAX ? cleaned.substring(0, MatchNotification.TITLE_MAX) : cleaned;
    }

    /** Microseconds: what MySQL DATETIME(6) and H2 keep, so a returned time equals the stored one. */
    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private static List<MatchNotificationRefreshResponse.Source> summarize(List<MatchRun> runs) {
        Map<MatchSource, List<SourceResult>> bySource = new EnumMap<>(MatchSource.class);
        for (MatchRun run : runs) {
            for (SourceResult source : run.sources()) {
                bySource.computeIfAbsent(source.source(), key -> new ArrayList<>()).add(source);
            }
        }
        List<MatchNotificationRefreshResponse.Source> summary = new ArrayList<>();
        bySource.forEach((source, results) -> {
            boolean allOk = results.stream().allMatch(r -> r.status() == SourceResult.Status.OK);
            boolean anyUsable = results.stream().anyMatch(r -> r.status() == SourceResult.Status.OK || r.status() == SourceResult.Status.PARTIAL);
            SourceResult.Status status = allOk ? SourceResult.Status.OK : anyUsable ? SourceResult.Status.PARTIAL : SourceResult.Status.UNAVAILABLE;
            String message = allOk ? null : results.stream().map(SourceResult::message).filter(m -> m != null).findFirst().orElse(null);
            summary.add(new MatchNotificationRefreshResponse.Source(source, status, message));
        });
        return summary;
    }
}

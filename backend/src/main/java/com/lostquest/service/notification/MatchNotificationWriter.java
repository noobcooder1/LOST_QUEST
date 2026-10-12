package com.lostquest.service.notification;

import com.lostquest.entity.MatchNotification;
import com.lostquest.entity.FoundItemStatus;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.MatchNotificationRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.service.matching.MatchSource;
import com.lostquest.service.matching.MatchTarget;
import com.lostquest.service.matching.MatchCandidate;
import com.lostquest.service.matching.MatchingService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Inserts one notification in its own transaction. A concurrent insert of the same (lost item, candidate) makes
 * the unique constraint fail with DataIntegrityViolationException, which callers treat as "already notified";
 * because each insert has its own transaction, that failure never affects other inserts or the caller.
 */
@Component
public class MatchNotificationWriter {

    private final MatchNotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final LostItemRepository lostItemRepository;
    private final FoundItemRepository foundItemRepository;

    public MatchNotificationWriter(MatchNotificationRepository notificationRepository, UserRepository userRepository,
                                   LostItemRepository lostItemRepository, FoundItemRepository foundItemRepository) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.lostItemRepository = lostItemRepository;
        this.foundItemRepository = foundItemRepository;
    }

    public record NewNotification(Long ownerId, Long lostItemId, MatchSource source, String candidateKey, Long foundItemId,
                                  String atcId, Integer fdSn, String foundTitle, LocalDate foundDate, int score, int maxScore,
                                  MatchTarget targetSnapshot, MatchCandidate candidateSnapshot) {
    }

    /** @return true when a row was inserted, false when this candidate was already notified for the lost item */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean insertIfAbsent(NewNotification n) {
        // Match computations run outside a transaction while awaiting the police API. Keep the same
        // found -> lost lock order as return creation, and validate snapshots before persisting old scores.
        if (n.source() == MatchSource.LOST_QUEST) {
            var candidate = foundItemRepository.findLocked(n.foundItemId()).orElse(null);
            if (candidate == null || candidate.getStatus() != FoundItemStatus.STORED ||
                    !MatchingService.toCandidate(candidate).equals(n.candidateSnapshot())) return false;
        }
        LostItem target = lostItemRepository.findLocked(n.lostItemId()).orElse(null);
        if (target == null || target.getStatus() != LostItemStatus.LOST ||
                !target.getUser().getId().equals(n.ownerId()) || !MatchTarget.of(target).equals(n.targetSnapshot())) return false;
        if (notificationRepository.existsByLostItem_IdAndCandidateKey(n.lostItemId(), n.candidateKey())) {
            return false;
        }
        notificationRepository.saveAndFlush(new MatchNotification(userRepository.getReferenceById(n.ownerId()),
                target, n.source(), n.candidateKey(), n.foundItemId(),
                n.atcId(), n.fdSn(), n.foundTitle(), n.foundDate(), n.score(), n.maxScore()));
        return true;
    }
}

package com.lostquest.service.notification;

import com.lostquest.entity.MatchNotification;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.MatchNotificationRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.service.matching.MatchSource;
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

    public MatchNotificationWriter(MatchNotificationRepository notificationRepository, UserRepository userRepository,
                                   LostItemRepository lostItemRepository) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.lostItemRepository = lostItemRepository;
    }

    public record NewNotification(Long ownerId, Long lostItemId, MatchSource source, String candidateKey, Long foundItemId,
                                  String atcId, Integer fdSn, String foundTitle, LocalDate foundDate, int score, int maxScore) {
    }

    /** @return true when a row was inserted, false when this candidate was already notified for the lost item */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean insertIfAbsent(NewNotification n) {
        if (notificationRepository.existsByLostItem_IdAndCandidateKey(n.lostItemId(), n.candidateKey())) {
            return false;
        }
        notificationRepository.saveAndFlush(new MatchNotification(userRepository.getReferenceById(n.ownerId()),
                lostItemRepository.getReferenceById(n.lostItemId()), n.source(), n.candidateKey(), n.foundItemId(),
                n.atcId(), n.fdSn(), n.foundTitle(), n.foundDate(), n.score(), n.maxScore()));
        return true;
    }
}

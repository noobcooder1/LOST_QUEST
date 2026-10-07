package com.lostquest.repository;

import com.lostquest.entity.MatchNotification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface MatchNotificationRepository extends JpaRepository<MatchNotification, Long> {

    boolean existsByLostItem_IdAndCandidateKey(Long lostItemId, String candidateKey);

    /** Newest first; the lost item is fetched for its title (open-in-view is off). */
    @Query("select n from MatchNotification n join fetch n.lostItem where n.user.id = :userId order by n.id desc")
    List<MatchNotification> findRecentForUser(@Param("userId") Long userId, Pageable pageable);

    /** Ownership is part of the lookup: another user's id behaves like a missing one. */
    @Query("select n from MatchNotification n join fetch n.lostItem where n.id = :id and n.user.id = :userId")
    Optional<MatchNotification> findForUser(@Param("id") Long id, @Param("userId") Long userId);

    long countByUser_IdAndReadAtIsNull(Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update MatchNotification n set n.readAt = :now where n.user.id = :userId and n.readAt is null")
    int markAllRead(@Param("userId") Long userId, @Param("now") Instant now);
}

package com.lostquest.repository;

import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface LostItemRepository extends JpaRepository<LostItem, Long> {

    List<LostItem> findAllByOrderByIdAsc();

    /** One user's lost items, newest registration first (id breaks ties within the same instant). */
    List<LostItem> findByUser_IdOrderByCreatedAtDescIdDesc(Long userId);

    /** Loads the author too, so ownership can be checked outside a transaction (open-in-view is off). */
    @Query("select l from LostItem l join fetch l.user where l.id = :id")
    Optional<LostItem> findWithUserById(@Param("id") Long id);

    /**
     * Lost items a newly registered found item could belong to: the same window the matching API uses
     * (found date from the lost date up to {@code to - from} days later), excluding the finder's own items.
     */
    @Query("""
            select l from LostItem l join fetch l.user
            where l.status = :status and l.lostDate between :from and :to and l.user.id <> :excludedUserId
            order by l.lostDate desc, l.id asc""")
    List<LostItem> findMatchTargets(@Param("status") LostItemStatus status, @Param("from") LocalDate from,
                                    @Param("to") LocalDate to, @Param("excludedUserId") Long excludedUserId,
                                    Pageable pageable);

    /** A user's open lost items lost on or after {@code since}, newest first (notification refresh targets). */
    @Query("""
            select l from LostItem l join fetch l.user
            where l.user.id = :userId and l.status = :status and l.lostDate >= :since
            order by l.lostDate desc, l.id desc""")
    List<LostItem> findRecentOpenByOwner(@Param("userId") Long userId, @Param("status") LostItemStatus status,
                                         @Param("since") LocalDate since, Pageable pageable);
}

package com.lostquest.repository;

import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface FoundItemRepository extends JpaRepository<FoundItem, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select f from FoundItem f where f.id = :id")
    java.util.Optional<FoundItem> findLocked(@org.springframework.data.repository.query.Param("id") Long id);
    long countByUser_Id(Long userId);

    List<FoundItem> findAllByOrderByIdAsc();

    /** One user's found items, newest registration first (id breaks ties within the same instant). */
    List<FoundItem> findByUser_IdOrderByCreatedAtDescIdDesc(Long userId);

    /** Matching candidates: bounded by status, found-date window and a row limit; the requester's own items are excluded. */
    List<FoundItem> findTop200ByStatusAndFoundDateBetweenAndUser_IdNotOrderByFoundDateAscIdAsc(
            FoundItemStatus status, LocalDate from, LocalDate to, Long excludedUserId);
}

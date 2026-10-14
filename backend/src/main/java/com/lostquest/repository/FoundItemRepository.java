package com.lostquest.repository;

import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface FoundItemRepository extends JpaRepository<FoundItem, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select f from FoundItem f where f.id = :id and f.status <> com.lostquest.entity.FoundItemStatus.CLOSED")
    java.util.Optional<FoundItem> findLocked(@org.springframework.data.repository.query.Param("id") Long id);
    @org.springframework.data.jpa.repository.Query("select count(f) from FoundItem f where f.user.id = :userId and f.status <> com.lostquest.entity.FoundItemStatus.CLOSED")
    long countByUser_Id(@org.springframework.data.repository.query.Param("userId") Long userId);

    @org.springframework.data.jpa.repository.Query("select f from FoundItem f where f.hidden = false and f.status <> com.lostquest.entity.FoundItemStatus.CLOSED order by f.id asc")
    List<FoundItem> findAllByOrderByIdAsc();

    /** One user's found items, newest registration first (id breaks ties within the same instant). */
    @org.springframework.data.jpa.repository.Query("select f from FoundItem f where f.user.id = :userId and f.status <> com.lostquest.entity.FoundItemStatus.CLOSED order by f.createdAt desc, f.id desc")
    List<FoundItem> findByUser_IdOrderByCreatedAtDescIdDesc(@org.springframework.data.repository.query.Param("userId") Long userId);

    /** Matching candidates: bounded by status, found-date window and a row limit; the requester's own items are excluded. */
    List<FoundItem> findTop200ByHiddenFalseAndStatusAndFoundDateBetweenAndUser_IdNotOrderByFoundDateAscIdAsc(
            FoundItemStatus status, LocalDate from, LocalDate to, Long excludedUserId);
}

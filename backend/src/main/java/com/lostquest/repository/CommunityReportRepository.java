package com.lostquest.repository;

import com.lostquest.entity.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface CommunityReportRepository extends JpaRepository<CommunityReport, Long> {
    boolean existsByReporter_IdAndItemTypeAndItemId(Long reporterId, CommunityItemType type, Long itemId);
    Slice<CommunityReport> findAllByOrderByIdDesc(Pageable pageable);
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from CommunityReport r where r.id = :id")
    Optional<CommunityReport> findLocked(@Param("id") Long id);
}

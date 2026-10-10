package com.lostquest.repository;
import com.lostquest.entity.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

public interface ReturnRequestRepository extends JpaRepository<ReturnRequest, Long> {
    @Query("select r from ReturnRequest r where r.requester.id = :userId or r.foundItem.user.id = :userId order by r.id desc")
    List<ReturnRequest> findVisible(@Param("userId") Long userId);
    List<ReturnRequest> findAllByOrderByIdDesc();
    Optional<ReturnRequest> findFirstByFoundItem_IdAndStatusNotOrderByIdDesc(Long id, ReturnStatus status);
    boolean existsByLostItem_IdAndStatusNot(Long id, ReturnStatus status);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ReturnRequest r where r.id = :id")
    Optional<ReturnRequest> findLocked(@Param("id") Long id);
    long countByFoundItem_User_IdAndStatus(Long userId, ReturnStatus status);
}

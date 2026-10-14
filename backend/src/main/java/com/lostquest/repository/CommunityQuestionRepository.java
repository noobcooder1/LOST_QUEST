package com.lostquest.repository;

import com.lostquest.entity.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface CommunityQuestionRepository extends JpaRepository<CommunityQuestion, Long> {
    @Query("select q from CommunityQuestion q where q.itemType = :type and q.itemId = :itemId and (q.author.id = :userId or q.requester.id = :userId) order by q.id desc")
    Slice<CommunityQuestion> findVisibleOnPost(@Param("type") CommunityItemType type, @Param("itemId") Long itemId,
        @Param("userId") Long userId, Pageable pageable);
    @Query("select q from CommunityQuestion q where q.author.id = :userId or q.requester.id = :userId order by q.id desc")
    Slice<CommunityQuestion> findInbox(@Param("userId") Long userId, Pageable pageable);
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from CommunityQuestion q where q.id = :id")
    Optional<CommunityQuestion> findLocked(@Param("id") Long id);
}

package com.lostquest.repository;
import com.lostquest.entity.ActivityNotification;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
public interface ActivityNotificationRepository extends JpaRepository<ActivityNotification, Long> {
    List<ActivityNotification> findTop100ByUser_IdOrderByIdDesc(Long userId);
    @Modifying
    @Query("update ActivityNotification n set n.readAt = :now where n.user.id = :userId and n.readAt is null")
    int markAllRead(@Param("userId") Long userId, @Param("now") Instant now);
}

package com.lostquest.repository;
import com.lostquest.entity.ExperienceEvent;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface ExperienceEventRepository extends JpaRepository<ExperienceEvent, Long> {
    @Query("select coalesce(sum(e.amount), 0) from ExperienceEvent e where e.user.id = :userId")
    long total(@Param("userId") Long userId);
}

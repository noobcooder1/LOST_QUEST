package com.lostquest.service;
import com.lostquest.dto.*;
import com.lostquest.entity.*;
import com.lostquest.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ActivityService {
    private final ExperienceEventRepository experience;
    private final ActivityNotificationRepository notifications;
    private final LostItemRepository lost;
    private final FoundItemRepository found;
    private final ReturnRequestRepository returns;
    public ActivityService(ExperienceEventRepository experience, ActivityNotificationRepository notifications,
            LostItemRepository lost, FoundItemRepository found, ReturnRequestRepository returns) {
        this.experience = experience; this.notifications = notifications; this.lost = lost; this.found = found; this.returns = returns;
    }
    public ProfileResponse profile(User user) {
        return new ProfileResponse(user.getNickname(), experience.total(user.getId()),
                lost.countByUser_Id(user.getId()) + found.countByUser_Id(user.getId()),
                returns.countByFoundItem_User_IdAndStatus(user.getId(), ReturnStatus.COMPLETED));
    }
    public List<ActivityNotificationResponse> notifications(User user) {
        return notifications.findTop100ByUser_IdOrderByIdDesc(user.getId()).stream().map(ActivityNotificationResponse::from).toList();
    }
    @Transactional
    public void notify(User user, String title, String message) {
        notifications.save(new ActivityNotification(user, title, message));
    }
    @Transactional
    public void registered(User user, String type, Long itemId, String title) {
        experience.save(new ExperienceEvent(user, "register:" + type + ":" + itemId, 10));
        notify(user, "물품 등록 완료 · +10 XP", "‘" + title + "’을 등록했어요.");
    }
    @Transactional
    public void returned(User user, Long returnId, String title) {
        experience.save(new ExperienceEvent(user, "return:" + returnId, 50));
        notify(user, "반환 완료 · +50 XP", "‘" + title + "’을 돌려준 경험치가 지급됐어요.");
    }
    @Transactional
    public void markRead(User user) { notifications.markAllRead(user.getId(), Instant.now()); }
}

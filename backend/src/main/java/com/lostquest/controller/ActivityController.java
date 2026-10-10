package com.lostquest.controller;
import com.lostquest.dto.*;
import com.lostquest.entity.User;
import com.lostquest.service.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
@RestController
@RequestMapping("/api/me/activity")
public class ActivityController {
    private final ActivityService activity;
    private final ReturnService returns;
    private final CurrentUserReader users;
    public ActivityController(ActivityService activity, ReturnService returns, CurrentUserReader users) {
        this.activity = activity; this.returns = returns; this.users = users;
    }
    @GetMapping
    @Transactional(readOnly = true)
    public ActivityResponse get(@AuthenticationPrincipal Jwt jwt) {
        User user = users.require(jwt.getSubject());
        return new ActivityResponse(activity.profile(user), returns.list(jwt.getSubject()), activity.notifications(user));
    }
    @PostMapping("/read-all")
    public java.util.Map<String, Boolean> markRead(@AuthenticationPrincipal Jwt jwt) {
        activity.markRead(users.require(jwt.getSubject())); return java.util.Map.of("success", true);
    }
}

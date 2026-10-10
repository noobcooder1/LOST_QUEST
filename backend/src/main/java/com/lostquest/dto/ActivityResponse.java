package com.lostquest.dto;
import java.util.List;
public record ActivityResponse(ProfileResponse profile, List<ReturnResponse> requests,
        List<ActivityNotificationResponse> notifications) {}

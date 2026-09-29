package com.lostquest.dto;

import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;

import java.time.Instant;

/** The signed-in user's own profile. The password hash is never included. */
public record AuthUserResponse(
        Long id,
        String email,
        String nickname,
        UserRole role,
        Instant createdAt
) {
    public static AuthUserResponse from(User user) {
        return new AuthUserResponse(user.getId(), user.getEmail(), user.getNickname(), user.getRole(), user.getCreatedAt());
    }
}

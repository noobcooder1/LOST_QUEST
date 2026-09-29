package com.lostquest.dto;

public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        AuthUserResponse user
) {
    public static LoginResponse bearer(String accessToken, long expiresIn, AuthUserResponse user) {
        return new LoginResponse(accessToken, "Bearer", expiresIn, user);
    }
}

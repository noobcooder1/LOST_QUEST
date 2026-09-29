package com.lostquest.exception;

/** Expected authentication failures (bad credentials, deleted account) mapped to 401, never 500. */
public class AuthenticationFailedException extends RuntimeException {
    private final String code;

    public AuthenticationFailedException(String code, String message) {
        super(message);
        this.code = code;
    }

    public static AuthenticationFailedException invalidCredentials() {
        // Same response for unknown email and wrong password, so account existence is not revealed.
        return new AuthenticationFailedException("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    public String getCode() {
        return code;
    }
}

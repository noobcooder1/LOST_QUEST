package com.lostquest.exception;

public class CommunityRateLimitException extends RuntimeException {
    public CommunityRateLimitException() { super("요청이 너무 잦아요. 잠시 후 다시 시도해 주세요."); }
}

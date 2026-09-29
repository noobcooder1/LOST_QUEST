package com.lostquest.exception;

import java.time.Instant;
import java.util.List;

public record ApiError(Instant timestamp, int status, String code, String message,
                       String path, List<FieldViolation> errors) {
    public record FieldViolation(String field, String message) {}

    public static ApiError of(int status, String code, String message, String path) {
        return new ApiError(Instant.now(), status, code, message, path, List.of());
    }
}

package com.lostquest.dto;

import java.nio.charset.StandardCharsets;

/** BCrypt only uses the first 72 bytes of a password, counted in UTF-8 rather than Java chars. */
final class BcryptPasswordLimit {
    static final int MAX_BYTES = 72;

    private BcryptPasswordLimit() {
    }

    /** Null is left to @NotBlank so a missing password reports a single, clear error. */
    static boolean fits(String password) {
        return password == null || password.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES;
    }
}

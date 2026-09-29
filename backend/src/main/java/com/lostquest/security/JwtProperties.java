package com.lostquest.security;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** The secret comes from JWT_SECRET or a gitignored local file; it is never hard-coded in source. */
@Validated
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
        @NotBlank(message = "app.jwt.secret (JWT_SECRET) must be configured") String secret,
        @NotBlank String issuer,
        @NotNull Duration accessTokenExpiration) {

    /** HS256 requires a key of at least 256 bits. */
    public static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        if (secret != null && !secret.isBlank() && secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalArgumentException("app.jwt.secret must be at least " + MIN_SECRET_BYTES + " bytes");
        }
        if (accessTokenExpiration != null && (accessTokenExpiration.isNegative() || accessTokenExpiration.isZero())) {
            throw new IllegalArgumentException("app.jwt.access-token-expiration must be positive");
        }
    }
}

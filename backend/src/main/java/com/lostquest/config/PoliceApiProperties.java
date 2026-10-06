package com.lostquest.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * Police (경찰청) OpenAPI settings. The lost, found and common-code services are approved separately and use
 * their own keys; a blank key only disables that one service. Keys come from environment variables or the
 * gitignored application-local.yml and must never be logged.
 */
@Validated
@ConfigurationProperties(prefix = "app.police-api")
public record PoliceApiProperties(
        @NotBlank String baseUrl,
        @NotNull Duration connectTimeout,
        @NotNull Duration readTimeout,
        @Valid @NotNull Service lost,
        @Valid @NotNull Service found,
        /** 경찰청_공통코드조회 서비스 (region / color / item-class codes for search filters). */
        @Valid @NotNull Service code) {

    public record Service(String serviceKey) {
        public boolean configured() {
            return serviceKey != null && !serviceKey.isBlank();
        }

        @Override
        public String toString() {
            return "Service[serviceKey=" + (configured() ? "<set>" : "<missing>") + "]";
        }
    }
}

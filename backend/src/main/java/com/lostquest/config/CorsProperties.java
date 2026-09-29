package com.lostquest.config;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(
        @NotEmpty List<@Pattern(regexp = "https?://[^/\\s?#*]+",
                message = "Origin must be an explicit http(s) origin without a path or wildcard") String> allowedOrigins) {
}

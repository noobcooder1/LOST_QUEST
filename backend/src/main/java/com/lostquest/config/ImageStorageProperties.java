package com.lostquest.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Local image directory; relative paths resolve against the working directory. */
@Validated
@ConfigurationProperties(prefix = "app.image-storage")
public record ImageStorageProperties(@NotBlank String localDir) {
}

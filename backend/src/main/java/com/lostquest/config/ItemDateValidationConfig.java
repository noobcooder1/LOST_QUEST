package com.lostquest.config;

import org.springframework.boot.autoconfigure.validation.ValidationConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class ItemDateValidationConfig {

    @Bean
    Clock itemDateClock() {
        return Clock.system(ZoneId.of("Asia/Seoul"));
    }

    @Bean
    ValidationConfigurationCustomizer itemDateValidationClock(Clock itemDateClock) {
        // @PastOrPresent event dates follow the site's Korean calendar even on a UTC server.
        // Registration instants continue to use Instant.now() and UTC persistence.
        return configuration -> configuration.clockProvider(() -> itemDateClock);
    }
}

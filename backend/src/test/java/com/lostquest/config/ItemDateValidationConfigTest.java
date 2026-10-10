package com.lostquest.config;

import com.lostquest.dto.CreateFoundItemRequest;
import com.lostquest.dto.CreateLostItemRequest;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class ItemDateValidationConfigTest {

    @Test
    void usesKoreanTodayWhenUtcStillHasThePreviousDate() {
        ItemDateValidationConfig settings = new ItemDateValidationConfig();
        assertThat(settings.itemDateClock().getZone()).isEqualTo(ZoneId.of("Asia/Seoul"));
        Clock clock = Clock.fixed(Instant.parse("2026-10-09T15:30:00Z"), ZoneId.of("Asia/Seoul"));
        var configuration = Validation.byDefaultProvider().configure();
        settings.itemDateValidationClock(clock).customize(configuration);
        try (var factory = configuration.buildValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(foundOn("2026-10-10"))).isEmpty();
            assertThat(validator.validate(lostOn("2026-10-10"))).isEmpty();
            assertThat(validator.validate(foundOn("2026-10-11"))).anyMatch(v -> v.getPropertyPath().toString().equals("foundDate"));
            assertThat(validator.validate(lostOn("2026-10-11"))).anyMatch(v -> v.getPropertyPath().toString().equals("lostDate"));
        }
    }

    private CreateFoundItemRequest foundOn(String date) {
        return new CreateFoundItemRequest("피규어", "기타", "검정", "검정 피규어를 보관하고 있습니다.",
                LocalDate.parse(date), "경기", "신구대학교", null, null);
    }

    private CreateLostItemRequest lostOn(String date) {
        return new CreateLostItemRequest("피규어", "기타", "검정", "검정 피규어를 찾고 있습니다.",
                LocalDate.parse(date), "경기", "신구대학교");
    }
}

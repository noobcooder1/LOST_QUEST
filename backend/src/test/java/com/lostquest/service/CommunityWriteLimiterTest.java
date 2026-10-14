package com.lostquest.service;

import com.lostquest.exception.CommunityRateLimitException;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CommunityWriteLimiterTest {
    @Test void separatesUsersAndOperationsAndExpiresMinuteWindows() {
        Clock clock = mock(Clock.class); when(clock.millis()).thenReturn(1000L);
        var limiter = new CommunityWriteLimiter(clock);
        limiter.check(1L, "post", 1);
        assertThatThrownBy(() -> limiter.check(1L, "post", 1)).isInstanceOf(CommunityRateLimitException.class);
        assertThatNoException().isThrownBy(() -> limiter.check(2L, "post", 1));
        assertThatNoException().isThrownBy(() -> limiter.check(1L, "question", 1));
        when(clock.millis()).thenReturn(61000L);
        assertThatNoException().isThrownBy(() -> limiter.check(1L, "post", 1));
    }
}

package com.lostquest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class LostQuestApplicationTests {

    @Test
    @DisplayName("스프링 부트 애플리케이션 컨텍스트 정상 로드 검증")
    void contextLoads() {
    }
}

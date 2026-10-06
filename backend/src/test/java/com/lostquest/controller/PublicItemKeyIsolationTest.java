package com.lostquest.controller;

import com.lostquest.client.MockPoliceServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The app starts without a lost-item key; only the lost endpoints report it, found items keep working. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PublicItemKeyIsolationTest {

    private static final MockPoliceServer SERVER = new MockPoliceServer();

    @DynamicPropertySource
    static void policeApi(DynamicPropertyRegistry registry) {
        registry.add("app.police-api.base-url", SERVER::baseUrl);
        registry.add("app.police-api.lost.service-key", () -> "");
        registry.add("app.police-api.found.service-key", () -> "test-found-key");
        registry.add("app.police-api.code.service-key", () -> "");
    }

    @AfterAll
    static void stopServer() {
        SERVER.close();
    }

    @Autowired
    private MockMvc mockMvc;

    @org.junit.jupiter.api.BeforeEach
    void reset() {
        SERVER.reset();
    }

    @Test
    @DisplayName("LOST 키 누락: 분실물 503 EXTERNAL_API_NOT_CONFIGURED(외부 호출 없음), 습득물 200")
    void missingLostKeyIsIsolated() throws Exception {
        SERVER.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        mockMvc.perform(get("/api/public-items/lost"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_NOT_CONFIGURED"));
        mockMvc.perform(get("/api/public-items/lost/L2026100500001176"))
                .andExpect(status().isServiceUnavailable());
        mockMvc.perform(get("/api/public-items/found"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));
        assertThat(SERVER.requests()).hasSize(1).allMatch(r -> r.contains("LosfundInfoInqireService"));
    }

    @Test
    @DisplayName("공통코드 키 누락: /filters와 필터 사용 요청만 503, 필터 없는 습득물 목록은 200")
    void missingCodeKeyIsIsolated() throws Exception {
        SERVER.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        mockMvc.perform(get("/api/public-items/filters"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_NOT_CONFIGURED"));
        mockMvc.perform(get("/api/public-items/found").param("region", "LCA000"))
                .andExpect(status().isServiceUnavailable());
        mockMvc.perform(get("/api/public-items/found")).andExpect(status().isOk());
        assertThat(SERVER.requests()).noneMatch(r -> r.contains("CmmnCdService"));
    }
}

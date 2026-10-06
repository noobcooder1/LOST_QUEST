package com.lostquest.controller;

import com.lostquest.client.MockPoliceServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;

import static com.lostquest.client.MockPoliceServer.fixture;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PublicItemControllerTest {

    private static final String LOST_KEY = "test-LOST-key-never-exposed";
    private static final String FOUND_KEY = "test-FOUND-key-never-exposed";
    private static final String CODE_KEY = "test-CODE-key-never-exposed";
    private static final MockPoliceServer SERVER = new MockPoliceServer();

    @DynamicPropertySource
    static void policeApi(DynamicPropertyRegistry registry) {
        registry.add("app.police-api.base-url", SERVER::baseUrl);
        registry.add("app.police-api.read-timeout", () -> "1s");
        registry.add("app.police-api.lost.service-key", () -> LOST_KEY);
        registry.add("app.police-api.found.service-key", () -> FOUND_KEY);
        registry.add("app.police-api.code.service-key", () -> CODE_KEY);
    }

    @AfterAll
    static void stopServer() {
        SERVER.close();
    }

    @Autowired
    private MockMvc mockMvc;

    @BeforeEach
    void reset() {
        SERVER.reset();
    }

    @Test
    @DisplayName("GET /api/public-items/lost: 로그인 없이 경찰청 분실물 정규화 JSON")
    void lostList() throws Exception {
        SERVER.replyFixture("getLostGoodsInfoAccToClAreaPd", "lost-list.xml");
        noKey(mockMvc.perform(get("/api/public-items/lost").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.searchMode").value("DATE_RANGE"))
                .andExpect(jsonPath("$.totalCount").value(33100))
                .andExpect(jsonPath("$.totalPages").value(16550))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].source").value("POLICE"))
                .andExpect(jsonPath("$.items[0].type").value("LOST"))
                .andExpect(jsonPath("$.items[0].sourceId").value("L2026100500001176"))
                .andExpect(jsonPath("$.items[0].title").value("오토바이 차키"))
                .andExpect(jsonPath("$.items[0].category").value("자동차"))
                .andExpect(jsonPath("$.items[0].date").value("2026-09-30"))
                .andExpect(jsonPath("$.items[0].color").doesNotExist())
                .andExpect(jsonPath("$.items[0].imageUrl").doesNotExist()));
        assertThat(SERVER.requests().get(0)).contains("serviceKey=" + LOST_KEY);
    }

    @Test
    @DisplayName("GET /api/public-items/found 및 상세(lost/{atcId}, found/{atcId}/{fdSn})")
    void foundListAndDetails() throws Exception {
        SERVER.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        SERVER.replyFixture("getLostGoodsDetailInfo", "lost-detail.xml");
        SERVER.replyFixture("getLosfundDetailInfo", "found-detail.xml");
        noKey(mockMvc.perform(get("/api/public-items/found"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].sourceId").value("F2026100500001940-1"))
                .andExpect(jsonPath("$.items[0].storagePlace").value("남강지구대"))
                .andExpect(jsonPath("$.items[0].imageUrl").doesNotExist())
                .andExpect(jsonPath("$.items[1].imageUrl").value(containsString("getOpenapiAttachFileImage/F2026100500001930"))));
        noKey(mockMvc.perform(get("/api/public-items/lost/L2026100500001176"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.detail").value(true))
                .andExpect(jsonPath("$.region").value("서울특별시"))
                .andExpect(jsonPath("$.color").value("핑크(분홍)")));
        noKey(mockMvc.perform(get("/api/public-items/found/F2026100500001940/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("보관중")));
        assertThat(SERVER.requests()).anyMatch(r -> r.contains("FD_SN=1"));
    }

    @Test
    @DisplayName("검색어 모드와 빈 결과")
    void keywordAndEmpty() throws Exception {
        SERVER.replyFixture("getLosfundInfoAccTpNmCstdyPlace", "list-empty.xml");
        mockMvc.perform(get("/api/public-items/found").param("q", "검정 지갑"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.searchMode").value("KEYWORD"))
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.from").doesNotExist());
    }

    @Test
    @DisplayName("잘못된 page/size/날짜/식별자는 400 (경찰청 호출 없음)")
    void validation() throws Exception {
        for (String query : new String[] {"page=0", "size=0", "size=51", "page=abc", "from=2026-13-01", "from=20261001",
                "from=2026-10-05&to=2026-09-01", "to=2999-01-01", "from=2026-01-01&to=2026-10-01", "q=x&from=2026-10-01"}) {
            mockMvc.perform(get("/api/public-items/lost?" + query))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400));
        }
        mockMvc.perform(get("/api/public-items/lost/F2026100500001940")).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/public-items/lost/L123")).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/public-items/found/F2026100500001940/0")).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/public-items/lost").param("q", "가".repeat(51))).andExpect(status().isBadRequest());
        assertThat(SERVER.requests()).isEmpty();
    }

    @Test
    @DisplayName("없는 상세는 404 NOT_FOUND")
    void detailNotFound() throws Exception {
        SERVER.replyFixture("getLostGoodsDetailInfo", "detail-empty.xml");
        mockMvc.perform(get("/api/public-items/lost/L2000010100000000"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("외부 API 오류는 500이 아닌 ApiError(502/503/504), 키·URL·업스트림 원문 미노출")
    void externalErrors() throws Exception {
        SERVER.reply("getLostGoodsInfoAccToClAreaPd", 403, fixture("gateway-not-registered.xml"));
        noKey(mockMvc.perform(get("/api/public-items/lost"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_AUTH_ERROR"))
                .andExpect(content().string(not(containsString("SERVICE_KEY_IS_NOT_REGISTERED")))));
        SERVER.replyFixture("getLostGoodsInfoAccToClAreaPd", "gateway-http-error.xml");
        noKey(mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_ERROR")));
        SERVER.replyFixture("getLostGoodsInfoAccToClAreaPd", "result-99.xml");
        noKey(mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_ERROR")));
        SERVER.replyFixture("getLostGoodsInfoAccToClAreaPd", "malformed.xml");
        noKey(mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_INVALID_RESPONSE")));
        SERVER.replyFixture("getLostGoodsInfoAccToClAreaPd", "xxe-billion-laughs.xml");
        noKey(mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_INVALID_RESPONSE")));
        SERVER.reply("getLostGoodsInfoAccToClAreaPd", 500, ("upstream echo " + LOST_KEY).getBytes(StandardCharsets.UTF_8));
        noKey(mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isBadGateway()));
        SERVER.reply("getLostGoodsInfoAccToClAreaPd", 429, new byte[0]);
        noKey(mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_RATE_LIMITED")));
        SERVER.replySlow("getLostGoodsInfoAccToClAreaPd", "lost-list.xml", 2_500);
        noKey(mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_TIMEOUT")));
    }

    @Test
    @DisplayName("GET /api/public-items/filters: 공통코드 기반 지역·물품분류(하위 포함)·색상 그룹, 로그인 불필요")
    void filters() throws Exception {
        SERVER.replyCommonCodes();
        noKey(mockMvc.perform(get("/api/public-items/filters"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.regions.length()").value(3))
                .andExpect(jsonPath("$.regions[0].value").value("LCA000"))
                .andExpect(jsonPath("$.regions[0].name").value("서울특별시"))
                .andExpect(jsonPath("$.categories[1].value").value("PRH000"))
                .andExpect(jsonPath("$.categories[1].children[1].value").value("PRH200"))
                .andExpect(jsonPath("$.categories[1].children[1].name").value("남성용 지갑"))
                .andExpect(jsonPath("$.colors.length()").value(3))
                .andExpect(jsonPath("$.colors[1].value").value("CL1002"))
                .andExpect(jsonPath("$.colors[1].name").value("블랙(검정)")));
        assertThat(SERVER.requests()).allMatch(r -> r.contains("CmmnCdService") && r.contains("serviceKey=" + CODE_KEY));
    }

    @Test
    @DisplayName("목록 필터 파라미터(region/category/subCategory/color)가 경찰청 코드 파라미터로 전달, 형식 오류는 400")
    void filterParameters() throws Exception {
        SERVER.replyCommonCodes();
        SERVER.replyFixture("getLostGoodsInfoAccToClAreaPd", "lost-list.xml");
        SERVER.replyFixtureWhen("getLosfundInfoAccToClAreaPd", "FD_COL_CD=CL1002", "found-list-black-cl1002.xml");
        SERVER.replyFixtureWhen("getLosfundInfoAccToClAreaPd", "FD_COL_CD=CL1043", "found-list-black-cl1043.xml");
        mockMvc.perform(get("/api/public-items/lost").param("region", "LCA000").param("category", "PRH000").param("subCategory", "PRH200"))
                .andExpect(status().isOk());
        assertThat(SERVER.requests()).anyMatch(r -> r.contains("getLostGoodsInfoAccToClAreaPd") && r.contains("LST_LCT_CD=LCA000")
                && r.contains("PRDT_CL_CD_01=PRH000") && r.contains("PRDT_CL_CD_02=PRH200"));
        noKey(mockMvc.perform(get("/api/public-items/found").param("region", "LCA000").param("color", "CL1002"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCount").value(10128))
                .andExpect(jsonPath("$.items.length()").value(2)));
        assertThat(SERVER.requests()).anyMatch(r -> r.contains("N_FD_LCT_CD=LCA000") && r.contains("FD_COL_CD=CL1043"));

        for (String query : new String[] {"region=seoul", "region=LCA00", "category=PRH0001", "subCategory=X", "color=black",
                "color=CL1002&q=%EC%A7%80%EA%B0%91", "region=LCZ000"}) {
            mockMvc.perform(get("/api/public-items/found?" + query)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        mockMvc.perform(get("/api/public-items/lost").param("color", "CL1002")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("color"));
    }

    @Test
    @DisplayName("분실물 API 장애 중에도 습득물 API는 정상")
    void lostFailureDoesNotAffectFound() throws Exception {
        SERVER.reply("getLostGoodsInfoAccToClAreaPd", 500, new byte[0]);
        SERVER.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        mockMvc.perform(get("/api/public-items/lost")).andExpect(status().isBadGateway());
        mockMvc.perform(get("/api/public-items/found")).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
    }

    @Test
    @DisplayName("공공데이터 API는 GET만 공개, 쓰기 요청은 차단")
    void onlyGetIsPublic() throws Exception {
        mockMvc.perform(post("/api/public-items/lost")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/public-items/other")).andExpect(status().isUnauthorized());
    }

    private static ResultActions noKey(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain(LOST_KEY).doesNotContain(FOUND_KEY).doesNotContain("serviceKey")
                .doesNotContain("127.0.0.1").doesNotContain("apis.data.go.kr");
        return result;
    }
}

package com.lostquest.client;

import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.ExternalApiException.Kind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static com.lostquest.client.MockPoliceServer.fixture;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PoliceXmlParserTest {

    @Test
    @DisplayName("분실물 목록 XML: 여러 item, totalCount/pageNo/numOfRows, 실제 필드명")
    void parsesLostList() {
        PoliceXmlResponse response = PoliceXmlParser.parse(fixture("lost-list.xml"), "test");
        assertThat(response.totalCount()).isEqualTo(33100);
        assertThat(response.pageNo()).isEqualTo(1);
        assertThat(response.numOfRows()).isEqualTo(2);
        assertThat(response.items()).hasSize(2);
        assertThat(response.items().get(0)).containsEntry("atcId", "L2026100500001176")
                .containsEntry("prdtClNm", "자동차 > 자동차열쇠")
                .containsEntry("lstPrdtNm", "오토바이 차키")
                .containsEntry("lstYmd", "2026-09-30")
                .doesNotContainKey("clrNm");
    }

    @Test
    @DisplayName("습득물 목록 XML: clrNm/depPlace/fdFilePathImg/fdSn 포함")
    void parsesFoundList() {
        PoliceXmlResponse response = PoliceXmlParser.parse(fixture("found-list.xml"), "test");
        assertThat(response.totalCount()).isEqualTo(57014);
        Map<String, String> first = response.items().get(0);
        assertThat(first).containsEntry("fdSn", "1").containsEntry("clrNm", "블랙(검정)")
                .containsEntry("depPlace", "남강지구대").containsKey("fdFilePathImg");
    }

    @Test
    @DisplayName("단일 item과 빈 결과(<items/>)")
    void singleAndEmpty() {
        PoliceXmlResponse single = PoliceXmlParser.parse(fixture("lost-list-single.xml"), "test");
        assertThat(single.items()).hasSize(1);
        assertThat(single.pageNo()).isEqualTo(3);
        PoliceXmlResponse empty = PoliceXmlParser.parse(fixture("list-empty.xml"), "test");
        assertThat(empty.items()).isEmpty();
        assertThat(empty.totalCount()).isZero();
        assertThat(PoliceXmlParser.parse(fixture("detail-empty.xml"), "test").items()).isEmpty();
    }

    @Test
    @DisplayName("상세 XML: CR(&#xd;) 정규화, 공백 값은 null, 없는 필드는 없음")
    void detailAndNullableFields() {
        Map<String, String> detail = PoliceXmlParser.parse(fixture("found-detail.xml"), "test").items().get(0);
        assertThat(detail.get("uniq")).doesNotContain("\r").contains("특이사항 : 없음");
        Map<String, String> sparse = PoliceXmlParser.parse(fixture("found-list-missing-fields.xml"), "test").items().get(0);
        assertThat(sparse.get("fdPrdtNm")).isNull();
        assertThat(sparse).doesNotContainKeys("clrNm", "depPlace", "prdtClNm");
    }

    @Test
    @DisplayName("resultCode 99 → UPSTREAM_ERROR, 게이트웨이 오류 분류 (HTTP_ERROR / 키 누락 / 미등록 키)")
    void upstreamAndGatewayErrors() {
        assertKind("result-99.xml", Kind.UPSTREAM_ERROR);
        assertKind("gateway-http-error.xml", Kind.UPSTREAM_ERROR);
        assertKind("gateway-key-null.xml", Kind.AUTH_FAILED);
        assertKind("gateway-not-registered.xml", Kind.AUTH_FAILED);
        String rateLimited = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</errMsg>"
                + "<returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
        assertThatThrownBy(() -> PoliceXmlParser.parse(rateLimited.getBytes(StandardCharsets.UTF_8), "test"))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(Kind.RATE_LIMITED));
    }

    @Test
    @DisplayName("깨진 XML·빈 본문·HTML·예상 밖 root는 INVALID_RESPONSE")
    void malformedXml() {
        assertKind("malformed.xml", Kind.INVALID_RESPONSE);
        for (String body : new String[] {"", "<html><body>Bad Gateway</body></html>", "not xml at all",
                "<response><body><totalCount>abc</totalCount></body><header><resultCode>00</resultCode></header></response>"}) {
            assertThatThrownBy(() -> PoliceXmlParser.parse(body.getBytes(StandardCharsets.UTF_8), "test"))
                    .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(Kind.INVALID_RESPONSE));
        }
    }

    @Test
    @DisplayName("XXE: 외부 엔티티로 로컬 파일을 읽으려는 XML은 거부되고 파일 내용이 노출되지 않음")
    void rejectsExternalEntities(@TempDir Path dir) throws Exception {
        Path secret = dir.resolve("secret.txt");
        Files.writeString(secret, "TOP-SECRET-FILE-CONTENT");
        String xml = new String(fixture("xxe-external-entity.xml"), StandardCharsets.UTF_8)
                .replace("/__SECRET_FILE__", secret.toAbsolutePath().toString().replace('\\', '/'));
        assertThatThrownBy(() -> PoliceXmlParser.parse(xml.getBytes(StandardCharsets.UTF_8), "test"))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> {
                    assertThat(ex.getKind()).isEqualTo(Kind.INVALID_RESPONSE);
                    assertThat(ex.getMessage() + ex.getDetail()).doesNotContain("TOP-SECRET");
                });
    }

    @Test
    @DisplayName("XXE: 엔티티 확장 폭탄(billion laughs)과 모든 DOCTYPE 거부")
    void rejectsDoctypeAndEntityExpansion() {
        assertKind("xxe-billion-laughs.xml", Kind.INVALID_RESPONSE);
        String externalDtd = "<?xml version=\"1.0\"?><!DOCTYPE response SYSTEM \"http://127.0.0.1:9/evil.dtd\"><response/>";
        assertThatThrownBy(() -> PoliceXmlParser.parse(externalDtd.getBytes(StandardCharsets.UTF_8), "test"))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(Kind.INVALID_RESPONSE));
    }

    private static void assertKind(String fixture, Kind kind) {
        assertThatThrownBy(() -> PoliceXmlParser.parse(fixture(fixture), "test"))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(kind));
    }
}

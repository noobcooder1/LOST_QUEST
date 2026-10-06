package com.lostquest.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class PoliceImagePolicyTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do",
            "https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/1.do"})
    @DisplayName("실제 응답에서 확인한 경찰청 첨부 이미지 URL만 허용")
    void acceptsRealAttachmentUrls(String url) {
        assertThat(PoliceImagePolicy.safeImageUrl(url)).isEqualTo(url);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            "https://minwon24.police.go.kr/images/sub/img02_no_img.gif",
            "https://minwon24.police.go.kr/images/sub/img04_no_img.gif",
            "https://www.lost112.go.kr/lostnfs/images/sub/img02_no_img.gif",
            "http://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do",
            "https://evil.example/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do",
            "https://minwon24.police.go.kr.evil.example/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do",
            "https://user@minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do",
            "https://minwon24.police.go.kr:8443/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do",
            "https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do?x=1",
            "https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/../../admin/1.do",
            "//minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do",
            "javascript:alert(1)",
            "data:image/png;base64,AAAA",
            "/api/images/3f2b8c1e-9a4d-4b6f-8e2a-1c3d5e7f9a0b.jpg",
            "https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do#x",
            "not a url"})
    @DisplayName("placeholder·http·다른 host·userinfo·포트·query·경로 조작·javascript:/data:·상대 URL은 null")
    void rejectsEverythingElse(String url) {
        assertThat(PoliceImagePolicy.safeImageUrl(url)).isNull();
    }
}

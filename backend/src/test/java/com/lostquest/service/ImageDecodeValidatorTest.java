package com.lostquest.service;

import com.lostquest.exception.InvalidImageException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImageDecodeValidatorTest {

    @Test
    @DisplayName("정상 JPEG·PNG 허용 (작은 이미지와 다운샘플링되는 큰 이미지)")
    void acceptsRealJpegAndPng() {
        assertThatCode(() -> ImageDecodeValidator.validate(TestImages.jpeg(48, 32), "jpeg")).doesNotThrowAnyException();
        assertThatCode(() -> ImageDecodeValidator.validate(TestImages.png(48, 32), "png")).doesNotThrowAnyException();
        assertThatCode(() -> ImageDecodeValidator.validate(TestImages.jpeg(2400, 1800), "jpeg")).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"valid-lossy.webp", "valid-lossless.webp", "valid-alpha.webp"})
    @DisplayName("정상 WebP(lossy·lossless·alpha) 허용")
    void acceptsRealWebp(String fixture) {
        assertThatCode(() -> ImageDecodeValidator.validate(TestImages.webp(fixture), "webp")).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"jpeg", "png", "webp"})
    @DisplayName("signature만 있는 16-byte 파일(QA 업로드와 동일) 거부")
    void rejectsSignatureOnlyStubs(String format) {
        assertInvalid(TestImages.signatureOnly(format), format);
    }

    @Test
    @DisplayName("잘린 JPEG(경고만 발생하는 경우 포함)·PNG·WebP 거부")
    void rejectsTruncatedImages() {
        assertInvalid(TestImages.truncated(TestImages.jpeg(320, 240)), "jpeg");
        assertInvalid(TestImages.truncated(TestImages.png(320, 240)), "png");
        assertInvalid(TestImages.truncated(TestImages.webp("valid-lossy.webp")), "webp");
        assertInvalid(TestImages.truncated(TestImages.webp("valid-lossless.webp")), "webp");
    }

    @Test
    @DisplayName("데이터가 손상된 JPEG·PNG·lossless WebP 거부")
    void rejectsCorruptedImages() {
        assertInvalid(TestImages.corrupted(TestImages.jpeg(320, 240)), "jpeg");
        assertInvalid(TestImages.corrupted(TestImages.png(320, 240)), "png");
        assertInvalid(TestImages.corrupted(TestImages.webp("valid-lossless.webp")), "webp");
    }

    @Test
    @DisplayName("다른 형식의 실제 이미지(PNG를 JPEG로 검증)는 거부")
    void rejectsFormatMismatch() {
        assertInvalid(TestImages.png(48, 32), "jpeg");
        assertInvalid(TestImages.jpeg(48, 32), "webp");
    }

    @Test
    @DisplayName("과도한 해상도는 디코드 없이 거부: 20000x20000 PNG 헤더, 한 변 16384 초과, WebP 4096x4096 초과")
    void rejectsOversizedDimensionsBeforeDecoding() {
        assertThatThrownBy(() -> ImageDecodeValidator.validate(TestImages.pngHeaderOnly(20_000, 20_000), "png"))
                .isInstanceOf(InvalidImageException.class).hasMessageContaining("해상도");
        assertThatThrownBy(() -> ImageDecodeValidator.validate(TestImages.pngHeaderOnly(16_385, 10), "png"))
                .isInstanceOf(InvalidImageException.class).hasMessageContaining("해상도");
        assertThatThrownBy(() -> ImageDecodeValidator.validate(TestImages.webpLosslessHeader(5000, 5000), "webp"))
                .isInstanceOf(InvalidImageException.class).hasMessageContaining("해상도");
    }

    @Test
    @DisplayName("동시 검증 요청도 모두 정상 처리 (동시 디코드 수 제한)")
    void concurrentValidations() throws Exception {
        byte[] jpeg = TestImages.jpeg(640, 480);
        byte[] webp = TestImages.webp("valid-lossy.webp");
        try (ExecutorService executor = Executors.newFixedThreadPool(8)) {
            List<Future<?>> futures = new ArrayList<>();
            for (int i = 0; i < 16; i++) {
                boolean even = i % 2 == 0;
                futures.add(executor.submit(() -> ImageDecodeValidator.validate(even ? jpeg : webp, even ? "jpeg" : "webp")));
            }
            for (Future<?> future : futures) {
                future.get();
            }
        }
    }

    private static void assertInvalid(byte[] content, String format) {
        assertThatThrownBy(() -> ImageDecodeValidator.validate(content, format)).isInstanceOf(InvalidImageException.class);
    }
}

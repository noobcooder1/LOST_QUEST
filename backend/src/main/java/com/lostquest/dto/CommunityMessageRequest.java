package com.lostquest.dto;

import jakarta.validation.constraints.*;

public record CommunityMessageRequest(
    @NotBlank @Size(max = 1000)
    @Pattern(regexp = "[^<>\\x00]*", message = "HTML 태그 없이 일반 텍스트로 입력해 주세요.") String message
) {}

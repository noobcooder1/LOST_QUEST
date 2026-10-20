package com.lostquest.dto;

import jakarta.validation.constraints.*;

public record CreateCommunityPostRequest(
    @NotBlank @Size(max = 10) String category,
    @NotBlank @Size(max = 120) String title,
    @NotBlank @Size(max = 3000) String content,
    @Size(max = 10) String linkedItemType,
    @Positive Long linkedItemId
) {}

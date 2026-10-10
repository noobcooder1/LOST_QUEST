package com.lostquest.dto;
import jakarta.validation.constraints.*;
public record CreateReturnRequest(@NotNull @Positive Long foundItemId, @Positive Long lostItemId) {}

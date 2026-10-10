package com.lostquest.dto;
import jakarta.validation.constraints.*;
public record OwnershipSetupRequest(@NotBlank @Size(max = 200) String question,
        @NotBlank @Size(max = 100) String answer) {}

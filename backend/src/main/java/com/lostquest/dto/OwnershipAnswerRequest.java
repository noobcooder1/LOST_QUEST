package com.lostquest.dto;
import jakarta.validation.constraints.*;
public record OwnershipAnswerRequest(@NotBlank @Size(max = 100) String answer) {}

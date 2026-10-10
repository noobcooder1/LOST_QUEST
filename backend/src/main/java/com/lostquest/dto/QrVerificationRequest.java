package com.lostquest.dto;
import jakarta.validation.constraints.*;
public record QrVerificationRequest(@NotBlank @Size(max = 200) String token) {}

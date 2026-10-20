package com.lostquest.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank @Size(max = 64) String currentPassword,
        @NotBlank @Size(min = 8, max = 64) String newPassword
) {
    /** BCrypt only uses the first 72 bytes; reject longer multi-byte passwords instead of truncating. */
    @AssertTrue(message = "비밀번호는 72바이트 이하여야 합니다.")
    public boolean isNewPasswordWithinBcryptLimit() {
        return BcryptPasswordLimit.fits(newPassword);
    }
}

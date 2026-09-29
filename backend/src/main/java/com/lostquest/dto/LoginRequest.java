package com.lostquest.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Size(max = 128) String password
) {
    /** Rejected before BCrypt is reached, so over-long input is a 400 rather than a library-dependent failure. */
    @AssertTrue(message = "비밀번호는 72바이트 이하여야 합니다.")
    public boolean isPasswordWithinBcryptLimit() {
        return BcryptPasswordLimit.fits(password);
    }
}

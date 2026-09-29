package com.lostquest.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** No role field: every signup creates a USER, so clients cannot request ADMIN. */
public record SignupRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 8, max = 64) String password,
        @NotBlank @Size(max = 20) String nickname
) {
    /** BCrypt only uses the first 72 bytes; reject longer multi-byte passwords instead of truncating. */
    @AssertTrue(message = "비밀번호는 72바이트 이하여야 합니다.")
    public boolean isPasswordWithinBcryptLimit() {
        return BcryptPasswordLimit.fits(password);
    }
}

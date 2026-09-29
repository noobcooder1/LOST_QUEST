package com.lostquest.security;

import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * No admin API exists yet, so ADMIN/USER separation is verified through the real token pipeline
 * (issue → decode → authority conversion) and method security on a test-only bean.
 */
@SpringBootTest
@ActiveProfiles("test")
class JwtRoleAuthorizationTest {

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JwtDecoder jwtDecoder;

    @Autowired
    private JwtAuthenticationConverter jwtAuthenticationConverter;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AdminOnlyProbe adminOnlyProbe;

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("USER 토큰은 ROLE_USER, ADMIN 토큰은 ROLE_ADMIN Authority로 매핑")
    void mapsRoleClaimToAuthorities() {
        assertThat(authoritiesOf(authenticate(UserRole.USER))).containsExactly("ROLE_USER");
        assertThat(authoritiesOf(authenticate(UserRole.ADMIN))).containsExactly("ROLE_ADMIN");
    }

    @Test
    @DisplayName("Principal 이름은 JWT subject(사용자 ID)")
    void principalNameIsUserId() {
        assertThat(authenticate(UserRole.USER).getName()).isEqualTo("42");
    }

    @Test
    @DisplayName("@PreAuthorize(hasRole('ADMIN')): ADMIN 허용, USER는 AccessDeniedException")
    void methodSecurityEnforcesAdminRole() {
        SecurityContextHolder.getContext().setAuthentication(authenticate(UserRole.ADMIN));
        assertThat(adminOnlyProbe.adminOnly()).isEqualTo("ok");
        assertThat(adminOnlyProbe.userOrAdmin()).isEqualTo("ok");

        SecurityContextHolder.getContext().setAuthentication(authenticate(UserRole.USER));
        assertThat(adminOnlyProbe.userOrAdmin()).isEqualTo("ok");
        assertThatThrownBy(adminOnlyProbe::adminOnly).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("설정된 JWT secret이 32바이트 미만이면 거부")
    void rejectsShortSecret() {
        assertThatThrownBy(() -> new JwtProperties("too-short", "lost-quest-api", Duration.ofHours(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new JwtProperties("x".repeat(32), "lost-quest-api", Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private AbstractAuthenticationToken authenticate(UserRole role) {
        User user = new User("role@lostquest.test", passwordEncoder.encode("Quest1234!"), "권한", role);
        ReflectionTestUtils.setField(user, "id", 42L);
        String token = jwtTokenProvider.issueAccessToken(user).value();
        return jwtAuthenticationConverter.convert(jwtDecoder.decode(token));
    }

    private List<String> authoritiesOf(AbstractAuthenticationToken authentication) {
        return authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
    }

    @TestConfiguration
    static class ProbeConfig {
        @Bean
        AdminOnlyProbe adminOnlyProbe() {
            return new AdminOnlyProbe();
        }
    }

    static class AdminOnlyProbe {
        @PreAuthorize("hasRole('ADMIN')")
        public String adminOnly() {
            return "ok";
        }

        @PreAuthorize("hasAnyRole('USER', 'ADMIN')")
        public String userOrAdmin() {
            return "ok";
        }
    }
}

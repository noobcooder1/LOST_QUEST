package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AuthControllerTest {

    private static final String PASSWORD = "Quest1234!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtEncoder jwtEncoder;

    @Autowired
    private JwtDecoder jwtDecoder;

    @Autowired
    private JwtProperties jwtProperties;

    @Test
    @DisplayName("회원가입 성공: 201, USER 권한, 응답에 비밀번호 미포함")
    void signupSucceeds() throws Exception {
        signup("hunter@lostquest.test", PASSWORD, "로스트헌터")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.email").value("hunter@lostquest.test"))
                .andExpect(jsonPath("$.nickname").value("로스트헌터"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.createdAt").exists())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(content().string(not(containsString(PASSWORD))));
    }

    @Test
    @DisplayName("회원가입 비밀번호는 BCrypt 해시로만 저장되고 평문이 DB에 남지 않음")
    void signupStoresBcryptHashOnly() throws Exception {
        signup("Hash@LostQuest.test", PASSWORD, "해시").andExpect(status().isCreated());

        User saved = userRepository.findByEmail("hash@lostquest.test").orElseThrow();
        assertThat(saved.getPassword()).isNotEqualTo(PASSWORD).doesNotContain(PASSWORD).startsWith("$2");
        assertThat(passwordEncoder.matches(PASSWORD, saved.getPassword())).isTrue();
    }

    @Test
    @DisplayName("회원가입 요청에 role=ADMIN을 넣어도 USER로 생성")
    void signupIgnoresClientRole() throws Exception {
        String body = """
                {"email":"admin-wannabe@lostquest.test","password":"%s","nickname":"해커","role":"ADMIN"}
                """.formatted(PASSWORD);
        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("USER"));
        assertThat(userRepository.findByEmail("admin-wannabe@lostquest.test").orElseThrow().getRole())
                .isEqualTo(UserRole.USER);
    }

    @Test
    @DisplayName("잘못된 회원가입 입력은 400 VALIDATION_ERROR, 입력값을 오류에 노출하지 않음")
    void signupRejectsInvalidInput() throws Exception {
        signup("not-an-email", "short", " ")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.path").value("/api/auth/signup"))
                .andExpect(jsonPath("$.errors[*].field", hasItem("email")))
                .andExpect(jsonPath("$.errors[*].field", hasItem("password")))
                .andExpect(jsonPath("$.errors[*].field", hasItem("nickname")))
                .andExpect(content().string(not(containsString("short"))));
        assertThat(userRepository.count()).isZero();
    }

    @Test
    @DisplayName("BCrypt 72바이트를 넘는 비밀번호는 500이 아닌 400")
    void signupRejectsPasswordOverBcryptLimit() throws Exception {
        signup("long@lostquest.test", "가".repeat(30), "긴비번")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("본문이 없거나 JSON이 아니면 400")
    void signupRejectsMalformedBody() throws Exception {
        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content("{broken"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    @DisplayName("이메일 중복 가입(대소문자 무시)은 409 EMAIL_ALREADY_EXISTS")
    void signupRejectsDuplicateEmail() throws Exception {
        signup("dup@lostquest.test", PASSWORD, "첫번째").andExpect(status().isCreated());
        signup("DUP@lostquest.test", PASSWORD, "두번째")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("로그인 성공 시 Bearer JWT 발급 (sub, role, iat, exp, iss 포함)")
    void loginIssuesJwt() throws Exception {
        signup("login@lostquest.test", PASSWORD, "탐험가").andExpect(status().isCreated());
        Long userId = userRepository.findByEmail("login@lostquest.test").orElseThrow().getId();

        JsonNode body = readJson(login("login@lostquest.test", PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(3600))
                .andExpect(jsonPath("$.user.id").value(userId))
                .andExpect(jsonPath("$.user.nickname").value("탐험가"))
                .andExpect(jsonPath("$.user.role").value("USER"))
                .andExpect(jsonPath("$.user.password").doesNotExist()));

        Jwt jwt = jwtDecoder.decode(body.get("accessToken").asText());
        assertThat(jwt.getSubject()).isEqualTo(String.valueOf(userId));
        assertThat(jwt.getClaimAsString("role")).isEqualTo("USER");
        assertThat(jwt.getIssuedAt()).isNotNull();
        assertThat(jwt.getExpiresAt()).isEqualTo(jwt.getIssuedAt().plusSeconds(3600));
        assertThat(jwt.getClaimAsString("iss")).isEqualTo("lost-quest-api");
        assertThat(jwt.getClaims()).doesNotContainKeys("email", "password");
    }

    @Test
    @DisplayName("잘못된 비밀번호와 없는 이메일은 같은 401 응답 (계정 존재 여부 비노출)")
    void loginFailuresAreIndistinguishable() throws Exception {
        signup("exists@lostquest.test", PASSWORD, "존재").andExpect(status().isCreated());

        String wrongPassword = login("exists@lostquest.test", "Wrong1234!")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.accessToken").doesNotExist())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String unknownEmail = login("nobody@lostquest.test", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JsonNode a = objectMapper.readTree(wrongPassword);
        JsonNode b = objectMapper.readTree(unknownEmail);
        assertThat(a.get("code")).isEqualTo(b.get("code"));
        assertThat(a.get("message")).isEqualTo(b.get("message"));
    }

    @Test
    @DisplayName("로그인 비밀번호가 정확히 72바이트(UTF-8)면 기존대로 BCrypt 검증 후 로그인")
    void loginAcceptsPasswordAtBcryptLimit() throws Exception {
        String asciiLimit = "a".repeat(72);
        String multiByteLimit = "가".repeat(24); // 3 bytes each in UTF-8 = 72 bytes, 24 chars
        // Signup caps passwords at 64 chars, so the 72-char ASCII account is stored directly.
        userRepository.save(new User("limit-ascii@lostquest.test", passwordEncoder.encode(asciiLimit), "경계", UserRole.USER));
        signup("limit-korean@lostquest.test", multiByteLimit, "경계한글").andExpect(status().isCreated());

        login("limit-ascii@lostquest.test", asciiLimit).andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isString());
        login("limit-korean@lostquest.test", multiByteLimit).andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isString());
        login("limit-korean@lostquest.test", "나".repeat(24))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    @DisplayName("로그인 비밀번호가 72바이트(UTF-8)를 넘으면 BCrypt 전에 400 VALIDATION_ERROR, 500 아님")
    void loginRejectsPasswordOverBcryptLimit() throws Exception {
        signup("over@lostquest.test", PASSWORD, "초과").andExpect(status().isCreated());

        // 73 ASCII bytes, and 25 Korean chars = 75 bytes although only 25 Java chars (well under @Size max).
        for (String tooLong : new String[] {"a".repeat(73), "가".repeat(25), "a".repeat(71) + "가"}) {
            login("over@lostquest.test", tooLong)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400))
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                    .andExpect(jsonPath("$.path").value("/api/auth/login"))
                    .andExpect(jsonPath("$.errors[*].field", hasItem("passwordWithinBcryptLimit")))
                    .andExpect(jsonPath("$.accessToken").doesNotExist())
                    .andExpect(content().string(not(containsString(tooLong))));
        }
        // An unknown email takes the same validation path (the dummy-hash check is never reached).
        login("nobody@lostquest.test", "가".repeat(25))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("빈 로그인 입력은 400")
    void loginRejectsBlankInput() throws Exception {
        login("", "")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("JWT 인증 후 GET /api/auth/me 성공")
    void meReturnsAuthenticatedUser() throws Exception {
        signup("me@lostquest.test", PASSWORD, "나").andExpect(status().isCreated());
        String token = accessToken("me@lostquest.test");

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("me@lostquest.test"))
                .andExpect(jsonPath("$.nickname").value("나"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    @DisplayName("토큰 없이 /api/auth/me 요청 시 401 UNAUTHORIZED")
    void meRequiresToken() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.path").value("/api/auth/me"));
    }

    @Test
    @DisplayName("변조된 JWT는 401 INVALID_TOKEN")
    void meRejectsTamperedToken() throws Exception {
        signup("tamper@lostquest.test", PASSWORD, "변조").andExpect(status().isCreated());
        String token = accessToken("tamper@lostquest.test");
        String[] parts = token.split("\\.");
        // Swap the payload for one claiming ADMIN while keeping the original signature.
        String forgedPayload = Base64.getUrlEncoder().withoutPadding().encodeToString(
                new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)
                        .replace("\"USER\"", "\"ADMIN\"").getBytes(StandardCharsets.UTF_8));
        String forged = parts[0] + "." + forgedPayload + "." + parts[2];

        expectInvalidToken(forged);
        expectInvalidToken(token.substring(0, token.length() - 2) + (token.endsWith("AA") ? "BB" : "AA"));
        expectInvalidToken("not.a.jwt");
    }

    @Test
    @DisplayName("다른 비밀키로 서명된 JWT는 401 INVALID_TOKEN")
    void meRejectsTokenSignedWithOtherKey() throws Exception {
        User user = userRepository.save(new User("other@lostquest.test", passwordEncoder.encode(PASSWORD), "다른키", UserRole.ADMIN));
        JwtEncoder attacker = new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(
                "attacker-controlled-secret-key-0123456789".getBytes(StandardCharsets.UTF_8), "HmacSHA256")));
        Instant now = Instant.now();
        expectInvalidToken(encode(attacker, user.getId(), "ADMIN", now, now.plus(1, ChronoUnit.HOURS), jwtProperties.issuer()));
    }

    @Test
    @DisplayName("만료된 JWT는 401 INVALID_TOKEN")
    void meRejectsExpiredToken() throws Exception {
        User user = userRepository.save(new User("expired@lostquest.test", passwordEncoder.encode(PASSWORD), "만료", UserRole.USER));
        Instant issuedAt = Instant.now().minus(2, ChronoUnit.HOURS);
        String expired = encode(jwtEncoder, user.getId(), "USER", issuedAt, issuedAt.plus(1, ChronoUnit.HOURS), jwtProperties.issuer());
        expectInvalidToken(expired);
    }

    @Test
    @DisplayName("발급자(iss)가 다른 JWT는 401 INVALID_TOKEN")
    void meRejectsForeignIssuer() throws Exception {
        User user = userRepository.save(new User("issuer@lostquest.test", passwordEncoder.encode(PASSWORD), "발급자", UserRole.USER));
        Instant now = Instant.now();
        expectInvalidToken(encode(jwtEncoder, user.getId(), "USER", now, now.plus(1, ChronoUnit.HOURS), "someone-else"));
    }

    @Test
    @DisplayName("탈퇴 등으로 DB에 없는 사용자의 유효한 토큰은 500이 아닌 401")
    void meRejectsTokenForMissingUser() throws Exception {
        Instant now = Instant.now();
        String token = encode(jwtEncoder, 999_999L, "USER", now, now.plus(1, ChronoUnit.HOURS), jwtProperties.issuer());
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    @DisplayName("ADMIN 계정 로그인 시 토큰과 /me에 ADMIN 권한 반영")
    void adminLoginCarriesAdminRole() throws Exception {
        userRepository.save(new User("admin@lostquest.test", passwordEncoder.encode(PASSWORD), "관리자", UserRole.ADMIN));
        String token = accessToken("admin@lostquest.test");
        assertThat(jwtDecoder.decode(token).getClaimAsString("role")).isEqualTo("ADMIN");

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"));
    }

    @Test
    @DisplayName("인증된 사용자라도 허용되지 않은 API는 403 FORBIDDEN")
    void authenticatedUserGetsForbiddenOnUnlistedApi() throws Exception {
        signup("forbidden@lostquest.test", PASSWORD, "금지").andExpect(status().isCreated());
        String token = accessToken("forbidden@lostquest.test");

        // POST /api/lost-items is now an authenticated API; updates are still not exposed.
        mockMvc.perform(put("/api/lost-items/1").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @DisplayName("기존 공개 GET API는 토큰 없이 계속 접근 가능")
    void publicGetApisStayOpen() throws Exception {
        mockMvc.perform(get("/api/lost-items")).andExpect(status().isOk());
        mockMvc.perform(get("/api/found-items")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("허용 Origin의 인증 API POST preflight 허용, 미등록 Origin 거부")
    void corsAllowsAuthPostOnlyFromConfiguredOrigins() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS));
        mockMvc.perform(options("/api/auth/me")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization"))
                .andExpect(status().isOk());
        mockMvc.perform(options("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, "https://evil.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden());
    }

    private ResultActions signup(String email, String password, String nickname) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "email", email, "password", password, "nickname", nickname));
        return mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions login(String email, String password) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("email", email, "password", password));
        return mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String accessToken(String email) throws Exception {
        return readJson(login(email, PASSWORD).andExpect(status().isOk())).get("accessToken").asText();
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private void expectInvalidToken(String token) throws Exception {
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    private String encode(JwtEncoder encoder, Long userId, String role, Instant issuedAt, Instant expiresAt, String issuer) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(String.valueOf(userId))
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("role", role)
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}

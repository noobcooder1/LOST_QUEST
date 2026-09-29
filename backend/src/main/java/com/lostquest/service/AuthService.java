package com.lostquest.service;

import com.lostquest.dto.AuthUserResponse;
import com.lostquest.dto.LoginRequest;
import com.lostquest.dto.LoginResponse;
import com.lostquest.dto.SignupRequest;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.exception.AuthenticationFailedException;
import com.lostquest.exception.DuplicateEmailException;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtTokenProvider;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    /** Compared against when the email is unknown so both failure paths cost one BCrypt check. */
    private final String dummyPasswordHash;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtTokenProvider jwtTokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.dummyPasswordHash = passwordEncoder.encode("lost-quest-timing-equalizer");
    }

    @Transactional
    public AuthUserResponse signup(SignupRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new DuplicateEmailException();
        }
        // A concurrent duplicate still hits uk_users_email and is reported as 409 by the existing handler.
        User user = userRepository.saveAndFlush(new User(email, passwordEncoder.encode(request.password()),
                request.nickname().trim(), UserRole.USER));
        return AuthUserResponse.from(user);
    }

    public LoginResponse login(LoginRequest request) {
        Optional<User> user = userRepository.findByEmail(normalizeEmail(request.email()));
        String hash = user.map(User::getPassword).orElse(dummyPasswordHash);
        boolean matches = passwordEncoder.matches(request.password(), hash);
        if (user.isEmpty() || !matches) {
            throw AuthenticationFailedException.invalidCredentials();
        }
        JwtTokenProvider.IssuedToken token = jwtTokenProvider.issueAccessToken(user.get());
        return LoginResponse.bearer(token.value(), token.expiresInSeconds(), AuthUserResponse.from(user.get()));
    }

    /** Resolves the JWT subject against the database so deleted accounts lose access immediately. */
    public AuthUserResponse getCurrentUser(String subject) {
        return parseUserId(subject)
                .flatMap(userRepository::findById)
                .map(AuthUserResponse::from)
                .orElseThrow(() -> new AuthenticationFailedException("UNAUTHORIZED", "사용자 정보를 확인할 수 없습니다. 다시 로그인해 주세요."));
    }

    private Optional<Long> parseUserId(String subject) {
        try {
            return Optional.of(Long.parseLong(subject));
        } catch (NumberFormatException ex) {
            return Optional.empty();
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}

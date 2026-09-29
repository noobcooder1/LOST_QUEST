package com.lostquest.service;

import com.lostquest.entity.User;
import com.lostquest.exception.AuthenticationFailedException;
import com.lostquest.repository.UserRepository;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Resolves the authenticated JWT subject (user id) to the stored User, so an item's author is
 * always the caller and never a client-supplied id. Missing users map to the existing 401 handler.
 */
@Component
public class CurrentUserReader {

    private final UserRepository userRepository;

    public CurrentUserReader(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User require(String subject) {
        return parseUserId(subject)
                .flatMap(userRepository::findById)
                .orElseThrow(() -> new AuthenticationFailedException("UNAUTHORIZED", "사용자 정보를 확인할 수 없습니다. 다시 로그인해 주세요."));
    }

    private Optional<Long> parseUserId(String subject) {
        try {
            return Optional.of(Long.parseLong(subject));
        } catch (NumberFormatException ex) {
            return Optional.empty();
        }
    }
}

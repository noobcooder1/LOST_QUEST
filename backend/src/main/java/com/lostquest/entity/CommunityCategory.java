package com.lostquest.entity;

import com.lostquest.exception.InvalidRequestParameterException;
import java.util.Locale;

public enum CommunityCategory {
    CHAT, INFO, QUESTION, STORY;

    public static CommunityCategory fromPath(String value) {
        return switch (value) {
            case "chat" -> CHAT;
            case "info" -> INFO;
            case "question" -> QUESTION;
            case "story" -> STORY;
            default -> throw new InvalidRequestParameterException("category", "커뮤니티 카테고리를 선택해 주세요.");
        };
    }

    public String path() { return name().toLowerCase(Locale.ROOT); }
}

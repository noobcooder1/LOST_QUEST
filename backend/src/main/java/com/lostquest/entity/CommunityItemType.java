package com.lostquest.entity;

import com.lostquest.exception.InvalidRequestParameterException;

public enum CommunityItemType {
    LOST, FOUND;

    public static CommunityItemType fromPath(String value) {
        return switch (value) {
            case "lost" -> LOST;
            case "found" -> FOUND;
            default -> throw new InvalidRequestParameterException("type", "분실물 또는 습득물을 선택해 주세요.");
        };
    }

    public String path() { return name().toLowerCase(java.util.Locale.ROOT); }
}

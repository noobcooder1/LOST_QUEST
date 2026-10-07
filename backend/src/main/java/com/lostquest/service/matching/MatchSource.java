package com.lostquest.service.matching;

/** Where a found-item candidate comes from. */
public enum MatchSource {
    /** LOST QUEST's own registrations (found_items table). */
    LOST_QUEST,
    /** 경찰청 습득물 공공데이터 (live OpenAPI, not stored). */
    POLICE
}

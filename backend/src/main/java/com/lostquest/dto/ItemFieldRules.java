package com.lostquest.dto;

/**
 * Shared validation values for item registration. Categories and regions mirror the frontend
 * lists in frontend/src/data/seed.ts so search filters keep working on server data.
 */
final class ItemFieldRules {
    static final String CATEGORY_PATTERN = "지갑|전자기기|가방|액세서리|기타";
    static final String CATEGORY_MESSAGE = "지갑, 전자기기, 가방, 액세서리, 기타 중 하나여야 합니다.";
    static final String REGION_PATTERN =
            "서울|경기|부산|인천|대구|대전|광주|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주";
    static final String REGION_MESSAGE = "지원하는 광역 지역(서울, 경기 등) 중 하나여야 합니다.";

    // All within the entity column limits (title 120, color 30, description 2000, location 255).
    static final int TITLE_MAX = 100;
    static final int COLOR_MAX = 30;
    static final int DESCRIPTION_MIN = 10;
    static final int DESCRIPTION_MAX = 2000;
    static final int LOCATION_MAX = 200;

    private ItemFieldRules() {
    }
}

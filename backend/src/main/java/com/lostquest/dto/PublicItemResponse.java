package com.lostquest.dto;

import java.time.LocalDate;

/**
 * A 경찰청 lost/found item normalized for LOST QUEST. Only values the police API actually returns are
 * filled; everything else is null. List responses carry fewer fields than detail responses
 * ({@code detail=false}), e.g. lost-item color, region and image exist only in the detail API.
 */
public record PublicItemResponse(
        String source,
        String type,
        /** Stable id: lost = atcId, found = atcId + "-" + fdSn (found items need both for detail lookup). */
        String sourceId,
        String atcId,
        Integer fdSn,
        String title,
        String subject,
        /** First segment of prdtClNm, e.g. "지갑" from "지갑 > 여성용 지갑". */
        String category,
        String categoryPath,
        String color,
        LocalDate date,
        /** Lost: free-text lost place (lstPlace). Found: found-place type (fdPlace, detail only). */
        String location,
        /** Lost: lost-place type (lstPlaceSeNm, detail only). */
        String placeType,
        /** Lost: region name (lstLctNm, detail only), e.g. "서울특별시". Not provided for found items. */
        String region,
        /** Found: storage place (depPlace). */
        String storagePlace,
        /** Only verified 경찰청 attachment image URLs; placeholders and anything else become null. */
        String imageUrl,
        String agencyName,
        String agencyTel,
        String status,
        String hour,
        String note,
        boolean detail
) {
}

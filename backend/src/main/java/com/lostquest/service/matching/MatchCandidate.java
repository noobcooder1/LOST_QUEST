package com.lostquest.service.matching;

import java.time.LocalDate;

/**
 * A found item that may belong to the owner of a lost item, from either source. Only values the source actually
 * provides are set; everything else is null and the matching criteria treat it as unknown.
 *
 * @param key           stable unique id across sources, e.g. "LOST_QUEST:12" or "POLICE:F2026100500001930-1"
 * @param region        LOST QUEST: the item's region. POLICE: the 경찰청 region name used as the search filter
 *                      that returned this item (the police list itself has no region field), otherwise null.
 */
public record MatchCandidate(
        MatchSource source,
        String key,
        Long foundItemId,
        String atcId,
        Integer fdSn,
        String title,
        String category,
        String color,
        LocalDate foundDate,
        String region,
        String location,
        String storagePlace,
        String imageUrl
) {
}

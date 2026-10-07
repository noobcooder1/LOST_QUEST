package com.lostquest.service.notification;

/** Published inside the found-item registration transaction; handled only after it commits. */
public record FoundItemRegisteredEvent(Long foundItemId, Long finderId) {
}

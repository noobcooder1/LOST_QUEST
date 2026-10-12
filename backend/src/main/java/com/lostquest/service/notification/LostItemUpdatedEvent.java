package com.lostquest.service.notification;

/** Allows the owner to refresh recommendations for the newly saved matching criteria. */
public record LostItemUpdatedEvent(Long lostItemId) {
}

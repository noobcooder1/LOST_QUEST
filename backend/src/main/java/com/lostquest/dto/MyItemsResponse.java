package com.lostquest.dto;

import java.util.List;

/** The signed-in user's own registrations, newest first within each list. Both lists are empty (never null) for a new user. */
public record MyItemsResponse(List<LostItemResponse> lostItems, List<FoundItemResponse> foundItems) {
}

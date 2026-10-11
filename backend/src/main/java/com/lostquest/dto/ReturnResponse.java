package com.lostquest.dto;
import com.lostquest.entity.*;
import java.time.Instant;
public record ReturnResponse(Long id, Long requesterId, Long finderId, FoundItemResponse foundItem,
        LostItemResponse lostItem, ReturnStatus status, Instant createdAt, Instant updatedAt,
        String qrToken, Instant qrExpiresAt, Instant qrUsedAt) {
    public static ReturnResponse from(ReturnRequest r, User viewer) {
        // Only the requester can present the credential; the finder verifies the token they receive at handover.
        String token = r.getRequester().getId().equals(viewer.getId()) && r.getStatus() == ReturnStatus.APPROVED
                ? r.getQrToken() : null;
        return new ReturnResponse(r.getId(), r.getRequester().getId(), r.getFoundItem().getUser().getId(),
                FoundItemResponse.from(r.getFoundItem()), r.getLostItem() == null ? null : LostItemResponse.from(r.getLostItem()),
                r.getStatus(), r.getCreatedAt(), r.getUpdatedAt(), token, r.getQrExpiresAt(), r.getQrUsedAt());
    }
}

package com.lostquest.dto;
import com.lostquest.entity.*;
import java.time.Instant;
/**
 * {@code qrToken} is set only for the requester while the request is APPROVED (the finder verifies what is shown at
 * handover). {@code ownershipAttemptsRemaining}/{@code ownershipLocked} describe the wrong-answer limit; the answer
 * itself and its hash are never part of any response.
 */
public record ReturnResponse(Long id, Long requesterId, Long finderId, FoundItemResponse foundItem,
        LostItemResponse lostItem, ReturnStatus status, Instant createdAt, Instant updatedAt,
        String qrToken, Instant qrExpiresAt, Instant qrUsedAt, int ownershipAttemptsRemaining, boolean ownershipLocked) {
    /** @param requesterQrToken the current QR token, computed by the service; only exposed to the requester */
    public static ReturnResponse from(ReturnRequest r, User viewer, String requesterQrToken) {
        String token = r.getRequester().getId().equals(viewer.getId()) && r.getStatus() == ReturnStatus.APPROVED
                ? requesterQrToken : null;
        return new ReturnResponse(r.getId(), r.getRequester().getId(), r.getFoundItem().getUser().getId(),
                FoundItemResponse.from(r.getFoundItem()), r.getLostItem() == null ? null : LostItemResponse.from(r.getLostItem()),
                r.getStatus(), r.getCreatedAt(), r.getUpdatedAt(), token, r.getQrExpiresAt(), r.getQrUsedAt(),
                r.ownershipAttemptsRemaining(), r.isOwnershipLocked());
    }
}

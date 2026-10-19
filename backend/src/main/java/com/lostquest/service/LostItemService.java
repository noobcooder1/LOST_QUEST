package com.lostquest.service;

import com.lostquest.dto.CreateLostItemRequest;
import com.lostquest.dto.LostItemResponse;
import com.lostquest.dto.UpdateLostItemRequest;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.entity.User;
import com.lostquest.entity.ReturnStatus;
import com.lostquest.exception.InvalidRequestParameterException;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.exception.WorkflowConflictException;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.ReturnRequestRepository;
import com.lostquest.repository.MatchNotificationRepository;
import com.lostquest.service.notification.LostItemUpdatedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class LostItemService {

    private final LostItemRepository lostItemRepository;
    private final CurrentUserReader currentUserReader;
    private final CommunityWriteLimiter writeLimiter;
    private final ImageService imageService;
    private final ActivityService activityService;
    private final ReturnRequestRepository returnRequests;
    private final MatchNotificationRepository matchNotifications;
    private final ApplicationEventPublisher eventPublisher;

    public LostItemService(LostItemRepository lostItemRepository, CurrentUserReader currentUserReader,
                          ImageService imageService, ActivityService activityService, CommunityWriteLimiter writeLimiter,
                          ReturnRequestRepository returnRequests, MatchNotificationRepository matchNotifications,
                          ApplicationEventPublisher eventPublisher) {
        this.lostItemRepository = lostItemRepository;
        this.currentUserReader = currentUserReader;
        this.writeLimiter = writeLimiter;
        this.imageService = imageService;
        this.activityService = activityService;
        this.returnRequests = returnRequests;
        this.matchNotifications = matchNotifications;
        this.eventPublisher = eventPublisher;
    }

    public List<LostItemResponse> findAll() {
        return lostItemRepository.findAllByOrderByIdAsc().stream()
                .map(LostItemResponse::from)
                .toList();
    }

    public LostItemResponse findById(Long id) {
        return lostItemRepository.findById(id)
                .filter(item -> item.getStatus() != LostItemStatus.CLOSED && !item.isHidden())
                .map(LostItemResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("분실물을 찾을 수 없습니다. id: " + id));
    }

    /** The author is the authenticated user; the initial status and (absent) image are server-controlled. */
    @Transactional
    public LostItemResponse create(String authenticatedSubject, CreateLostItemRequest request) {
        return create(authenticatedSubject, request, null);
    }

    /**
     * Same as the JSON create, plus an optional image. The author is resolved before the file is written,
     * and the stored file is removed again if this transaction does not commit.
     */
    @Transactional
    public LostItemResponse create(String authenticatedSubject, CreateLostItemRequest request, MultipartFile image) {
        User author = currentUserReader.require(authenticatedSubject);
        CommunityTextRules.publicText(request.title(), request.color(), request.description(), request.location());
        writeLimiter.check(author.getId(), "post", 10);
        String imageUrl = isPresent(image) ? imageService.storeForNewItem(image) : null;
        LostItem item = new LostItem(author, request.title().trim(),
                request.category(), request.color().trim(), request.description().trim(), request.lostDate(),
                request.region(), request.location().trim(), imageUrl, LostItemStatus.LOST);
        LostItem saved = lostItemRepository.saveAndFlush(item);
        activityService.registered(author, "lost", saved.getId(), saved.getTitle());
        return LostItemResponse.from(saved);
    }

    @Transactional
    public LostItemResponse update(String subject, Long id, UpdateLostItemRequest request, MultipartFile image) {
        LostItem item = requireEditable(subject, id);
        CommunityTextRules.publicText(request.title(), request.color(), request.description(), request.location());
        if (request.removeImage() && isPresent(image)) {
            throw new InvalidRequestParameterException("removeImage", "사진 교체와 삭제는 동시에 할 수 없습니다.");
        }
        String imageUrl = request.removeImage() ? null : item.getImageUrl();
        if (isPresent(image)) imageUrl = imageService.storeForNewItem(image);
        item.revise(request.title().trim(), request.category(), request.color().trim(), request.description().trim(),
                request.lostDate(), request.region(), request.location().trim(), imageUrl);
        matchNotifications.deleteByLostItem_Id(id);
        eventPublisher.publishEvent(new LostItemUpdatedEvent(id));
        return LostItemResponse.from(item);
    }

    @Transactional
    public void delete(String subject, Long id) {
        LostItem item = requireEditable(subject, id);
        item.close();
        matchNotifications.deleteByLostItem_Id(id);
    }

    private LostItem requireEditable(String subject, Long id) {
        User author = currentUserReader.require(subject);
        LostItem item = lostItemRepository.findLocked(id)
                .orElseThrow(() -> new ResourceNotFoundException("분실물을 찾을 수 없습니다. id: " + id));
        if (!item.getUser().getId().equals(author.getId())) {
            throw new AccessDeniedException("등록자만 물품글을 수정하거나 삭제할 수 있습니다.");
        }
        if (item.isHidden()) {
            throw new WorkflowConflictException("관리자가 숨김 처리한 물품글은 수정하거나 삭제할 수 없습니다.");
        }
        if (item.getStatus() != LostItemStatus.LOST || returnRequests.existsByLostItem_IdAndStatusNot(id, ReturnStatus.REJECTED)) {
            throw new WorkflowConflictException("반환 요청이 진행 중이거나 완료된 물품글은 수정하거나 삭제할 수 없습니다.");
        }
        return item;
    }

    /** An empty file part without a name is what a form sends when no file was chosen. */
    private static boolean isPresent(MultipartFile image) {
        return image != null && !(image.isEmpty() && (image.getOriginalFilename() == null || image.getOriginalFilename().isBlank()));
    }
}

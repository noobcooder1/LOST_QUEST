package com.lostquest.service;

import com.lostquest.dto.CreateFoundItemRequest;
import com.lostquest.dto.FoundItemResponse;
import com.lostquest.dto.UpdateFoundItemRequest;
import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import com.lostquest.entity.User;
import com.lostquest.entity.ReturnStatus;
import com.lostquest.exception.InvalidRequestParameterException;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.exception.WorkflowConflictException;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.ReturnRequestRepository;
import com.lostquest.repository.MatchNotificationRepository;
import com.lostquest.service.notification.FoundItemRegisteredEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class FoundItemService {

    private final FoundItemRepository foundItemRepository;
    private final CurrentUserReader currentUserReader;
    private final CommunityWriteLimiter writeLimiter;
    private final ImageService imageService;
    private final ApplicationEventPublisher eventPublisher;
    private final ActivityService activityService;
    private final OwnershipProof ownershipProof;
    private final ReturnRequestRepository returnRequests;
    private final MatchNotificationRepository matchNotifications;

    public FoundItemService(FoundItemRepository foundItemRepository, CurrentUserReader currentUserReader,
                            ImageService imageService, ApplicationEventPublisher eventPublisher, CommunityWriteLimiter writeLimiter,
                            ActivityService activityService, OwnershipProof ownershipProof,
                            ReturnRequestRepository returnRequests, MatchNotificationRepository matchNotifications) {
        this.foundItemRepository = foundItemRepository;
        this.currentUserReader = currentUserReader;
        this.writeLimiter = writeLimiter;
        this.imageService = imageService;
        this.eventPublisher = eventPublisher;
        this.activityService = activityService;
        this.ownershipProof = ownershipProof;
        this.returnRequests = returnRequests;
        this.matchNotifications = matchNotifications;
    }

    public List<FoundItemResponse> findAll() {
        return foundItemRepository.findAllByOrderByIdAsc().stream()
                .map(FoundItemResponse::from)
                .toList();
    }

    public FoundItemResponse findById(Long id) {
        return foundItemRepository.findById(id)
                .filter(item -> item.getStatus() != FoundItemStatus.CLOSED && !item.isHidden())
                .map(FoundItemResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("습득물을 찾을 수 없습니다. id: " + id));
    }

    /** The author is the authenticated user; the initial status and (absent) image are server-controlled. */
    @Transactional
    public FoundItemResponse create(String authenticatedSubject, CreateFoundItemRequest request) {
        return create(authenticatedSubject, request, null);
    }

    /**
     * Same as the JSON create, plus an optional image. The author is resolved before the file is written,
     * and the stored file is removed again if this transaction does not commit.
     */
    @Transactional
    public FoundItemResponse create(String authenticatedSubject, CreateFoundItemRequest request, MultipartFile image) {
        User author = currentUserReader.require(authenticatedSubject);
        CommunityTextRules.publicText(request.title(), request.color(), request.description(), request.location());
        writeLimiter.check(author.getId(), "post", 10);
        boolean hasQuestion = request.ownershipQuestion() != null && !request.ownershipQuestion().isBlank();
        boolean hasAnswer = request.ownershipAnswer() != null && !request.ownershipAnswer().isBlank();
        if (hasQuestion != hasAnswer) throw new com.lostquest.exception.InvalidRequestParameterException(
                "ownershipAnswer", "소유자 확인 질문과 답변을 함께 입력해 주세요.");
        String imageUrl = isPresent(image) ? imageService.storeForNewItem(image) : null;
        FoundItem item = new FoundItem(author, request.title().trim(),
                request.category(), request.color().trim(), request.description().trim(), request.foundDate(),
                request.region(), request.location().trim(), imageUrl, FoundItemStatus.STORED);
        FoundItem saved = foundItemRepository.saveAndFlush(item);
        if (hasAnswer) saved.configureOwnership(request.ownershipQuestion().trim(), ownershipProof.encode(request.ownershipAnswer()));
        activityService.registered(author, "found", saved.getId(), saved.getTitle());
        // Match notifications for lost-item owners are created only after this registration commits.
        eventPublisher.publishEvent(new FoundItemRegisteredEvent(saved.getId(), author.getId()));
        return FoundItemResponse.withOwnershipQuestion(saved);
    }

    /** Updating and deleting use the same item lock as return creation to prevent overlapping workflows. */
    @Transactional
    public FoundItemResponse update(String subject, Long id, UpdateFoundItemRequest request, MultipartFile image) {
        FoundItem item = requireEditable(subject, id);
        CommunityTextRules.publicText(request.title(), request.color(), request.description(), request.location());
        boolean hasQuestion = request.ownershipQuestion() != null && !request.ownershipQuestion().isBlank();
        boolean hasAnswer = request.ownershipAnswer() != null && !request.ownershipAnswer().isBlank();
        if (hasQuestion != hasAnswer) {
            throw new InvalidRequestParameterException("ownershipAnswer", "소유자 확인 질문과 답변을 함께 입력해 주세요.");
        }
        if (request.removeImage() && isPresent(image)) {
            throw new InvalidRequestParameterException("removeImage", "사진 교체와 삭제는 동시에 할 수 없습니다.");
        }
        String imageUrl = request.removeImage() ? null : item.getImageUrl();
        if (isPresent(image)) imageUrl = imageService.storeForNewItem(image);
        item.revise(request.title().trim(), request.category(), request.color().trim(), request.description().trim(),
                request.foundDate(), request.region(), request.location().trim(), imageUrl);
        if (hasAnswer) item.configureOwnership(request.ownershipQuestion().trim(), ownershipProof.encode(request.ownershipAnswer()));
        // Titles, dates and scores in match notifications are snapshots of the previous post.
        matchNotifications.deleteByFoundItemId(id);
        eventPublisher.publishEvent(new FoundItemRegisteredEvent(item.getId(), item.getUser().getId()));
        return FoundItemResponse.withOwnershipQuestion(item);
    }

    @Transactional
    public void delete(String subject, Long id) {
        FoundItem item = requireEditable(subject, id);
        item.close();
        matchNotifications.deleteByFoundItemId(id);
    }

    private FoundItem requireEditable(String subject, Long id) {
        User author = currentUserReader.require(subject);
        FoundItem item = foundItemRepository.findLocked(id)
                .orElseThrow(() -> new ResourceNotFoundException("습득물을 찾을 수 없습니다. id: " + id));
        if (!item.getUser().getId().equals(author.getId())) {
            throw new AccessDeniedException("등록자만 물품글을 수정하거나 삭제할 수 있습니다.");
        }
        if (item.isHidden()) {
            throw new WorkflowConflictException("관리자가 숨김 처리한 물품글은 수정하거나 삭제할 수 없습니다.");
        }
        if (item.getStatus() != FoundItemStatus.STORED ||
                returnRequests.findFirstByFoundItem_IdAndStatusNotOrderByIdDesc(id, ReturnStatus.REJECTED).isPresent()) {
            throw new WorkflowConflictException("반환 요청이 진행 중이거나 완료된 물품글은 수정하거나 삭제할 수 없습니다.");
        }
        return item;
    }

    /** An empty file part without a name is what a form sends when no file was chosen. */
    private static boolean isPresent(MultipartFile image) {
        return image != null && !(image.isEmpty() && (image.getOriginalFilename() == null || image.getOriginalFilename().isBlank()));
    }
}

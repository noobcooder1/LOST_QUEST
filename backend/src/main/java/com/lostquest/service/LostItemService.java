package com.lostquest.service;

import com.lostquest.dto.CreateLostItemRequest;
import com.lostquest.dto.LostItemResponse;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.entity.User;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.LostItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class LostItemService {

    private final LostItemRepository lostItemRepository;
    private final CurrentUserReader currentUserReader;
    private final ImageService imageService;
    private final ActivityService activityService;

    public LostItemService(LostItemRepository lostItemRepository, CurrentUserReader currentUserReader,
                          ImageService imageService, ActivityService activityService) {
        this.lostItemRepository = lostItemRepository;
        this.currentUserReader = currentUserReader;
        this.imageService = imageService;
        this.activityService = activityService;
    }

    public List<LostItemResponse> findAll() {
        return lostItemRepository.findAllByOrderByIdAsc().stream()
                .map(LostItemResponse::from)
                .toList();
    }

    public LostItemResponse findById(Long id) {
        return lostItemRepository.findById(id)
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
        String imageUrl = isPresent(image) ? imageService.storeForNewItem(image) : null;
        LostItem item = new LostItem(author, request.title().trim(),
                request.category(), request.color().trim(), request.description().trim(), request.lostDate(),
                request.region(), request.location().trim(), imageUrl, LostItemStatus.LOST);
        LostItem saved = lostItemRepository.saveAndFlush(item);
        activityService.registered(author, "lost", saved.getId(), saved.getTitle());
        return LostItemResponse.from(saved);
    }

    /** An empty file part without a name is what a form sends when no file was chosen. */
    private static boolean isPresent(MultipartFile image) {
        return image != null && !(image.isEmpty() && (image.getOriginalFilename() == null || image.getOriginalFilename().isBlank()));
    }
}

package com.lostquest.service;

import com.lostquest.dto.CreateFoundItemRequest;
import com.lostquest.dto.FoundItemResponse;
import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import com.lostquest.entity.User;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.FoundItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class FoundItemService {

    private final FoundItemRepository foundItemRepository;
    private final CurrentUserReader currentUserReader;
    private final ImageService imageService;

    public FoundItemService(FoundItemRepository foundItemRepository, CurrentUserReader currentUserReader,
                            ImageService imageService) {
        this.foundItemRepository = foundItemRepository;
        this.currentUserReader = currentUserReader;
        this.imageService = imageService;
    }

    public List<FoundItemResponse> findAll() {
        return foundItemRepository.findAllByOrderByIdAsc().stream()
                .map(FoundItemResponse::from)
                .toList();
    }

    public FoundItemResponse findById(Long id) {
        return foundItemRepository.findById(id)
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
        String imageUrl = isPresent(image) ? imageService.storeForNewItem(image) : null;
        FoundItem item = new FoundItem(author, request.title().trim(),
                request.category(), request.color().trim(), request.description().trim(), request.foundDate(),
                request.region(), request.location().trim(), imageUrl, FoundItemStatus.STORED);
        return FoundItemResponse.from(foundItemRepository.saveAndFlush(item));
    }

    /** An empty file part without a name is what a form sends when no file was chosen. */
    private static boolean isPresent(MultipartFile image) {
        return image != null && !(image.isEmpty() && (image.getOriginalFilename() == null || image.getOriginalFilename().isBlank()));
    }
}

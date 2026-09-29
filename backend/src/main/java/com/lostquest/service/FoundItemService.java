package com.lostquest.service;

import com.lostquest.dto.CreateFoundItemRequest;
import com.lostquest.dto.FoundItemResponse;
import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.FoundItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class FoundItemService {

    private final FoundItemRepository foundItemRepository;
    private final CurrentUserReader currentUserReader;

    public FoundItemService(FoundItemRepository foundItemRepository, CurrentUserReader currentUserReader) {
        this.foundItemRepository = foundItemRepository;
        this.currentUserReader = currentUserReader;
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
        FoundItem item = new FoundItem(currentUserReader.require(authenticatedSubject), request.title().trim(),
                request.category(), request.color().trim(), request.description().trim(), request.foundDate(),
                request.region(), request.location().trim(), null, FoundItemStatus.STORED);
        return FoundItemResponse.from(foundItemRepository.saveAndFlush(item));
    }
}

package com.lostquest.service;

import com.lostquest.dto.CreateLostItemRequest;
import com.lostquest.dto.LostItemResponse;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.LostItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class LostItemService {

    private final LostItemRepository lostItemRepository;
    private final CurrentUserReader currentUserReader;

    public LostItemService(LostItemRepository lostItemRepository, CurrentUserReader currentUserReader) {
        this.lostItemRepository = lostItemRepository;
        this.currentUserReader = currentUserReader;
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
        LostItem item = new LostItem(currentUserReader.require(authenticatedSubject), request.title().trim(),
                request.category(), request.color().trim(), request.description().trim(), request.lostDate(),
                request.region(), request.location().trim(), null, LostItemStatus.LOST);
        return LostItemResponse.from(lostItemRepository.saveAndFlush(item));
    }
}

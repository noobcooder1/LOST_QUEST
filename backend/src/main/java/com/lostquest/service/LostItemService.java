package com.lostquest.service;

import com.lostquest.dto.LostItemResponse;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.LostItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class LostItemService {

    private final LostItemRepository lostItemRepository;

    public LostItemService(LostItemRepository lostItemRepository) {
        this.lostItemRepository = lostItemRepository;
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
}

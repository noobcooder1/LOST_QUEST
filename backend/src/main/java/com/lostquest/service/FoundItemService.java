package com.lostquest.service;

import com.lostquest.dto.FoundItemResponse;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.FoundItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class FoundItemService {

    private final FoundItemRepository foundItemRepository;

    public FoundItemService(FoundItemRepository foundItemRepository) {
        this.foundItemRepository = foundItemRepository;
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
}

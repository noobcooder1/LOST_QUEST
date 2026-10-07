package com.lostquest.service;

import com.lostquest.dto.FoundItemResponse;
import com.lostquest.dto.LostItemResponse;
import com.lostquest.dto.MyItemsResponse;
import com.lostquest.entity.User;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The signed-in user's own lost and found items. The owner is always resolved from the authenticated JWT subject
 * (never from a client-supplied id), and both lists are read in one transaction so they form a consistent snapshot.
 */
@Service
@Transactional(readOnly = true)
public class MyItemService {

    private final LostItemRepository lostItemRepository;
    private final FoundItemRepository foundItemRepository;
    private final CurrentUserReader currentUserReader;

    public MyItemService(LostItemRepository lostItemRepository, FoundItemRepository foundItemRepository,
                         CurrentUserReader currentUserReader) {
        this.lostItemRepository = lostItemRepository;
        this.foundItemRepository = foundItemRepository;
        this.currentUserReader = currentUserReader;
    }

    public MyItemsResponse findMine(String authenticatedSubject) {
        User owner = currentUserReader.require(authenticatedSubject);
        return new MyItemsResponse(
                lostItemRepository.findByUser_IdOrderByCreatedAtDescIdDesc(owner.getId()).stream()
                        .map(LostItemResponse::from).toList(),
                foundItemRepository.findByUser_IdOrderByCreatedAtDescIdDesc(owner.getId()).stream()
                        .map(FoundItemResponse::from).toList());
    }
}

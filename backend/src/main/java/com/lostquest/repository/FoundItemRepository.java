package com.lostquest.repository;

import com.lostquest.entity.FoundItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FoundItemRepository extends JpaRepository<FoundItem, Long> {

    List<FoundItem> findAllByOrderByIdAsc();
}

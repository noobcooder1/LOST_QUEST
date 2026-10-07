package com.lostquest.repository;

import com.lostquest.entity.LostItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface LostItemRepository extends JpaRepository<LostItem, Long> {

    List<LostItem> findAllByOrderByIdAsc();

    /** One user's lost items, newest registration first (id breaks ties within the same instant). */
    List<LostItem> findByUser_IdOrderByCreatedAtDescIdDesc(Long userId);

    /** Loads the author too, so ownership can be checked outside a transaction (open-in-view is off). */
    @Query("select l from LostItem l join fetch l.user where l.id = :id")
    Optional<LostItem> findWithUserById(@Param("id") Long id);
}

package com.lostquest.repository;

import com.lostquest.entity.*;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {
    @Query("""
        select p from CommunityPost p join fetch p.author
        where (:category is null or p.category = :category)
          and (:query is null or lower(p.title) like :query escape '!' or lower(p.content) like :query escape '!')
          and (:from is null or p.createdAt >= :from)
          and (:until is null or p.createdAt < :until)
        order by p.createdAt desc, p.id desc
        """)
    Slice<CommunityPost> findFiltered(@Param("category") CommunityCategory category, @Param("query") String query,
        @Param("from") Instant from, @Param("until") Instant until, Pageable pageable);

    @Override @EntityGraph(attributePaths = "author")
    Optional<CommunityPost> findById(Long id);
}

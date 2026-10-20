package com.lostquest.repository;

import com.lostquest.entity.CommunityComment;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
    @Query("""
        select c from CommunityComment c join fetch c.author
        where c.post.id = :postId
        order by c.createdAt asc, c.id asc
        """)
    List<CommunityComment> findForPost(@Param("postId") Long postId, Pageable pageable);

    /** Rows of [postId, count] for one list page, so cards show counts without loading comments. */
    @Query("select c.post.id, count(c) from CommunityComment c where c.post.id in :postIds group by c.post.id")
    List<Object[]> countByPostIds(@Param("postIds") Collection<Long> postIds);

    long countByPostId(Long postId);
}

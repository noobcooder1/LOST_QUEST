package com.lostquest.service;

import com.lostquest.dto.*;
import com.lostquest.entity.*;
import com.lostquest.exception.*;
import com.lostquest.repository.*;
import java.time.*;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional(readOnly = true)
public class CommunityPostService {
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private static final int MAX_COMMENTS_SHOWN = 300;
    private final CommunityPostRepository posts;
    private final CommunityCommentRepository comments;
    private final CurrentUserReader users;
    private final LostItemRepository lost;
    private final FoundItemRepository found;
    private final ImageService images;
    private final CommunityWriteLimiter limiter;

    public CommunityPostService(CommunityPostRepository posts, CommunityCommentRepository comments, CurrentUserReader users,
            LostItemRepository lost, FoundItemRepository found, ImageService images, CommunityWriteLimiter limiter) {
        this.posts = posts; this.comments = comments; this.users = users; this.lost = lost; this.found = found;
        this.images = images; this.limiter = limiter;
    }

    public CommunityPage<CommunityPostResponse> list(String category, String query, LocalDate from, LocalDate to, int page) {
        if (from != null && to != null && from.isAfter(to))
            throw new InvalidRequestParameterException("from", "시작 날짜는 종료 날짜보다 늦을 수 없습니다.");
        String pattern = query == null || query.isBlank() ? null : "%" + query.trim().toLowerCase(Locale.ROOT)
            .replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        var slice = posts.findFiltered(category == null ? null : CommunityCategory.fromPath(category), pattern,
            from == null ? null : from.atStartOfDay(KOREA).toInstant(),
            to == null ? null : to.plusDays(1).atStartOfDay(KOREA).toInstant(), PageRequest.of(page, 20));
        Map<Long, Long> counts = new HashMap<>();
        if (slice.hasContent())
            for (Object[] row : comments.countByPostIds(slice.getContent().stream().map(CommunityPost::getId).toList()))
                counts.put((Long) row[0], (Long) row[1]);
        return CommunityPage.from(slice, post -> response(post, counts.getOrDefault(post.getId(), 0L)));
    }

    public CommunityPostResponse detail(Long id) {
        CommunityPost post = requirePost(id);
        return response(post, comments.countByPostId(post.getId()));
    }

    public List<CommunityCommentResponse> comments(Long postId, String viewerSubject) {
        requirePost(postId);
        Long viewerId = viewerSubject == null ? null : users.require(viewerSubject).getId();
        return comments.findForPost(postId, PageRequest.of(0, MAX_COMMENTS_SHOWN)).stream()
            .map(comment -> CommunityCommentResponse.from(comment, viewerId)).toList();
    }

    @Transactional
    public CommunityCommentResponse addComment(String subject, Long postId, CommunityCommentRequest input) {
        User author = users.require(subject);
        CommunityPost post = requirePost(postId);
        CommunityTextRules.publicText(input.content());
        limiter.check(author.getId(), "comment", 20);
        CommunityComment saved = comments.saveAndFlush(new CommunityComment(post, author, input.content().trim()));
        return CommunityCommentResponse.from(saved, author.getId());
    }

    @Transactional
    public void deleteComment(String subject, Long postId, Long commentId) {
        User viewer = users.require(subject);
        CommunityComment comment = comments.findById(commentId)
            .filter(found -> found.getPost().getId().equals(postId))
            .orElseThrow(() -> new ResourceNotFoundException("댓글을 찾을 수 없습니다."));
        // Re-read the role from MySQL like other admin checks; only the author or an admin may remove a reply.
        if (!comment.getAuthor().getId().equals(viewer.getId()) && viewer.getRole() != UserRole.ADMIN)
            throw new AccessDeniedException("본인이 쓴 댓글만 삭제할 수 있습니다.");
        comments.delete(comment);
    }

    private CommunityPost requirePost(Long id) {
        return posts.findById(id).orElseThrow(() -> new ResourceNotFoundException("커뮤니티 글을 찾을 수 없습니다."));
    }

    @Transactional
    public CommunityPostResponse create(String subject, CreateCommunityPostRequest input, MultipartFile image) {
        User author = users.require(subject);
        CommunityCategory category = CommunityCategory.fromPath(input.category());
        CommunityTextRules.publicText(input.title(), input.content());
        if ((input.linkedItemType() == null) != (input.linkedItemId() == null))
            throw new InvalidRequestParameterException("linkedItemId", "연결할 물품의 종류와 번호를 함께 입력해 주세요.");
        CommunityItemType type = input.linkedItemType() == null ? null : CommunityItemType.fromPath(input.linkedItemType());
        // The item lock serializes linking with hide/close. Only items currently public may be linked.
        if (type != null && linkedItem(type, input.linkedItemId(), true) == null)
            throw new ResourceNotFoundException("연결할 물품글을 찾을 수 없습니다.");
        limiter.check(author.getId(), "post", 10);
        String imageUrl = image == null ? null : images.storeForNewItem(image);
        CommunityPost saved = posts.saveAndFlush(new CommunityPost(author, category, input.title().trim(), input.content().trim(),
            imageUrl, type, input.linkedItemId()));
        return response(saved, 0);
    }

    private CommunityPostResponse response(CommunityPost post, long commentCount) {
        return CommunityPostResponse.from(post, post.getLinkedItemType() == null ? null
            : linkedItem(post.getLinkedItemType(), post.getLinkedItemId(), false), commentCount);
    }

    private CommunityPostResponse.LinkedItem linkedItem(CommunityItemType type, Long id, boolean lock) {
        // Resolve the current public title every time; never return snapshots of hidden/closed item details.
        if (type == CommunityItemType.LOST)
            return (lock ? lost.findLocked(id) : lost.findById(id))
                .filter(item -> !item.isHidden() && item.getStatus() != LostItemStatus.CLOSED)
                .map(item -> new CommunityPostResponse.LinkedItem(item.getId(), type.path(), item.getTitle())).orElse(null);
        return (lock ? found.findLocked(id) : found.findById(id))
            .filter(item -> !item.isHidden() && item.getStatus() != FoundItemStatus.CLOSED)
            .map(item -> new CommunityPostResponse.LinkedItem(item.getId(), type.path(), item.getTitle())).orElse(null);
    }
}

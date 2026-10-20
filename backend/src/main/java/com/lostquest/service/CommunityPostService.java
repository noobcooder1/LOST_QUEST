package com.lostquest.service;

import com.lostquest.dto.*;
import com.lostquest.entity.*;
import com.lostquest.exception.*;
import com.lostquest.repository.*;
import java.time.*;
import java.util.Locale;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional(readOnly = true)
public class CommunityPostService {
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private final CommunityPostRepository posts;
    private final CurrentUserReader users;
    private final LostItemRepository lost;
    private final FoundItemRepository found;
    private final ImageService images;
    private final CommunityWriteLimiter limiter;

    public CommunityPostService(CommunityPostRepository posts, CurrentUserReader users, LostItemRepository lost,
            FoundItemRepository found, ImageService images, CommunityWriteLimiter limiter) {
        this.posts = posts; this.users = users; this.lost = lost; this.found = found;
        this.images = images; this.limiter = limiter;
    }

    public CommunityPage<CommunityPostResponse> list(String category, String query, LocalDate from, LocalDate to, int page) {
        if (from != null && to != null && from.isAfter(to))
            throw new InvalidRequestParameterException("from", "시작 날짜는 종료 날짜보다 늦을 수 없습니다.");
        String pattern = query == null || query.isBlank() ? null : "%" + query.trim().toLowerCase(Locale.ROOT)
            .replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        return CommunityPage.from(posts.findFiltered(category == null ? null : CommunityCategory.fromPath(category), pattern,
            from == null ? null : from.atStartOfDay(KOREA).toInstant(),
            to == null ? null : to.plusDays(1).atStartOfDay(KOREA).toInstant(), PageRequest.of(page, 20)), this::response);
    }

    public CommunityPostResponse detail(Long id) {
        return response(posts.findById(id).orElseThrow(() -> new ResourceNotFoundException("커뮤니티 글을 찾을 수 없습니다.")));
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
        return response(saved);
    }

    private CommunityPostResponse response(CommunityPost post) {
        return CommunityPostResponse.from(post, post.getLinkedItemType() == null ? null
            : linkedItem(post.getLinkedItemType(), post.getLinkedItemId(), false));
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

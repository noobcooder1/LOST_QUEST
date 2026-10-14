package com.lostquest.service;

import com.lostquest.dto.*;
import com.lostquest.entity.*;
import com.lostquest.exception.*;
import com.lostquest.repository.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CommunityService {
    private final CurrentUserReader users;
    private final LostItemRepository lost;
    private final FoundItemRepository found;
    private final CommunityQuestionRepository questions;
    private final CommunityReportRepository reports;
    private final CommunityWriteLimiter limiter;
    private final MatchNotificationRepository matchNotifications;

    public CommunityService(CurrentUserReader users, LostItemRepository lost, FoundItemRepository found,
            CommunityQuestionRepository questions, CommunityReportRepository reports, CommunityWriteLimiter limiter,
            MatchNotificationRepository matchNotifications) {
        this.users = users; this.lost = lost; this.found = found;
        this.questions = questions; this.reports = reports; this.limiter = limiter;
        this.matchNotifications = matchNotifications;
    }
    private record Post(User author, String title, boolean hidden, boolean open) {}
    private Post post(CommunityItemType type, Long id, boolean lock) {
        if (type == CommunityItemType.LOST) {
            LostItem item = (lock ? lost.findLocked(id) : lost.findById(id))
                .filter(i -> i.getStatus() != LostItemStatus.CLOSED).orElseThrow(CommunityService::notFound);
            return new Post(item.getUser(), item.getTitle(), item.isHidden(), item.getStatus() == LostItemStatus.LOST);
        }
        FoundItem item = (lock ? found.findLocked(id) : found.findById(id))
            .filter(i -> i.getStatus() != FoundItemStatus.CLOSED).orElseThrow(CommunityService::notFound);
        return new Post(item.getUser(), item.getTitle(), item.isHidden(), item.getStatus() == FoundItemStatus.STORED);
    }
    private static ResourceNotFoundException notFound() { return new ResourceNotFoundException("게시글을 찾을 수 없습니다."); }
    private static void participant(CommunityQuestion question, User viewer) {
        if (!question.getAuthor().getId().equals(viewer.getId()) && !question.getRequester().getId().equals(viewer.getId()))
            throw new AccessDeniedException("질문자와 게시글 작성자만 확인할 수 있습니다.");
    }
    private static void admin(User viewer) {
        // Re-read the role from MySQL; even a stale ADMIN token cannot promote a USER.
        if (viewer.getRole() != UserRole.ADMIN) throw new AccessDeniedException("관리자만 처리할 수 있습니다.");
    }
    public CommunityPage<CommunityQuestionResponse> onPost(String subject, CommunityItemType type, Long id, int page) {
        User viewer = users.require(subject);
        Post post = post(type, id, false);
        if (post.hidden()) throw notFound();
        return CommunityPage.from(questions.findVisibleOnPost(type, id, viewer.getId(), PageRequest.of(page, 20)),
            q -> CommunityQuestionResponse.from(q, viewer.getId()));
    }
    public CommunityPage<CommunityQuestionResponse> inbox(String subject, int page) {
        User viewer = users.require(subject);
        return CommunityPage.from(questions.findInbox(viewer.getId(), PageRequest.of(page, 20)),
            q -> CommunityQuestionResponse.from(q, viewer.getId()));
    }
    public CommunityQuestionResponse question(String subject, Long id) {
        User viewer = users.require(subject);
        CommunityQuestion q = questions.findById(id).orElseThrow(() -> new ResourceNotFoundException("질문을 찾을 수 없습니다."));
        participant(q, viewer);
        return CommunityQuestionResponse.from(q, viewer.getId());
    }
    @Transactional
    public CommunityQuestionResponse ask(String subject, CommunityItemType type, Long id, String message) {
        User viewer = users.require(subject);
        Post post = post(type, id, true);
        if (post.hidden()) throw notFound();
        if (!post.open()) throw new WorkflowConflictException("진행이 종료된 게시글에는 새 질문을 보낼 수 없습니다.");
        if (post.author().getId().equals(viewer.getId())) throw new WorkflowConflictException("본인 게시글에는 질문을 보낼 수 없습니다.");
        limiter.check(viewer.getId(), "question", 20);
        CommunityQuestion saved = questions.saveAndFlush(new CommunityQuestion(type, id, post.title(), post.author(), viewer, message.trim()));
        return CommunityQuestionResponse.from(saved, viewer.getId());
    }
    @Transactional
    public CommunityQuestionResponse answer(String subject, Long id, String message) {
        User viewer = users.require(subject);
        CommunityQuestion q = questions.findLocked(id).orElseThrow(() -> new ResourceNotFoundException("질문을 찾을 수 없습니다."));
        if (!q.getAuthor().getId().equals(viewer.getId())) throw new AccessDeniedException("게시글 작성자만 답변할 수 있습니다.");
        Post post = post(q.getItemType(), q.getItemId(), false);
        if (post.hidden()) throw notFound();
        if (q.getAnswer() != null) throw new WorkflowConflictException("이미 답변한 질문입니다. 답변은 덮어쓸 수 없습니다.");
        limiter.check(viewer.getId(), "answer", 30);
        q.answer(message.trim());
        return CommunityQuestionResponse.from(q, viewer.getId());
    }
    @Transactional
    public void report(String subject, CommunityItemType type, Long id, String reason) {
        User viewer = users.require(subject);
        Post post = post(type, id, true); // Serialize duplicates with the same existing item lock used by CRUD/returns.
        if (post.hidden()) throw notFound();
        if (reports.existsByReporter_IdAndItemTypeAndItemId(viewer.getId(), type, id))
            throw new WorkflowConflictException("이미 신고한 게시글입니다.");
        limiter.check(viewer.getId(), "report", 10);
        reports.saveAndFlush(new CommunityReport(type, id, post.title(), viewer, reason.trim()));
    }
    public CommunityPage<CommunityReportResponse> reports(String subject, int page) {
        admin(users.require(subject));
        return CommunityPage.from(reports.findAllByOrderByIdDesc(PageRequest.of(page, 20)), CommunityReportResponse::from);
    }
    @Transactional
    public CommunityReportResponse hide(String subject, Long id) {
        User viewer = users.require(subject); admin(viewer);
        CommunityReport report = reports.findLocked(id).orElseThrow(() -> new ResourceNotFoundException("신고를 찾을 수 없습니다."));
        // Do not delete posts or alter return status. In-progress returns retain their authorized history.
        if (report.getItemType() == CommunityItemType.LOST) {
            lost.findLocked(report.getItemId()).orElseThrow(CommunityService::notFound).hide();
            matchNotifications.deleteByLostItem_Id(report.getItemId());
        } else {
            found.findLocked(report.getItemId()).orElseThrow(CommunityService::notFound).hide();
            matchNotifications.deleteByFoundItemId(report.getItemId());
        }
        report.markHidden(viewer);
        return CommunityReportResponse.from(report);
    }
}

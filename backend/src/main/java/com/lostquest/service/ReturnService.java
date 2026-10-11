package com.lostquest.service;

import com.lostquest.dto.*;
import com.lostquest.entity.*;
import com.lostquest.exception.*;
import com.lostquest.repository.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.Duration;
import java.util.Base64;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ReturnService {
    private final ReturnRequestRepository returns;
    private final FoundItemRepository found;
    private final LostItemRepository lost;
    private final CurrentUserReader users;
    private final OwnershipProof proof;
    private final ActivityService activity;
    private final SecureRandom random = new SecureRandom();
    public ReturnService(ReturnRequestRepository returns, FoundItemRepository found, LostItemRepository lost,
            CurrentUserReader users, OwnershipProof proof, ActivityService activity) {
        this.returns = returns; this.found = found; this.lost = lost; this.users = users; this.proof = proof; this.activity = activity;
    }
    private boolean manager(ReturnRequest request, User user) {
        return user.getRole() == UserRole.ADMIN || request.getFoundItem().getUser().getId().equals(user.getId());
    }
    private void requireManager(ReturnRequest request, User user) {
        if (!manager(request, user)) throw new AccessDeniedException("반환 승인 권한이 없습니다.");
    }
    private void requireRequester(ReturnRequest request, User user) {
        if (!request.getRequester().getId().equals(user.getId())) throw new AccessDeniedException("요청자만 이용할 수 있습니다.");
    }
    private ReturnRequest get(Long id) {
        return returns.findById(id).orElseThrow(() -> new ResourceNotFoundException("반환 요청을 찾을 수 없습니다."));
    }
    private ReturnRequest lock(Long id) {
        return returns.findLocked(id).orElseThrow(() -> new ResourceNotFoundException("반환 요청을 찾을 수 없습니다."));
    }
    private void expected(ReturnRequest request, ReturnStatus status) {
        if (request.getStatus() != status) throw new WorkflowConflictException("현재 반환 단계에서는 이 작업을 진행할 수 없습니다. 새로고침해 주세요.");
    }
    private void issueQr(ReturnRequest request) {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        request.issueQr(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes), Instant.now().plus(Duration.ofMinutes(30)));
    }
    public List<ReturnResponse> list(String subject) {
        User user = users.require(subject);
        List<ReturnRequest> requests = user.getRole() == UserRole.ADMIN ? returns.findAllByOrderByIdDesc() : returns.findVisible(user.getId());
        return requests.stream().map(r -> ReturnResponse.from(r, user)).toList();
    }
    public ReturnResponse detail(String subject, Long id) {
        User user = users.require(subject); ReturnRequest request = get(id);
        if (!manager(request, user) && !request.getRequester().getId().equals(user.getId())) throw new AccessDeniedException("접근 권한이 없습니다.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public ReturnResponse create(String subject, CreateReturnRequest input) {
        User user = users.require(subject);
        FoundItem item = found.findLocked(input.foundItemId()).orElseThrow(() -> new ResourceNotFoundException("습득물을 찾을 수 없습니다."));
        if (item.getUser().getId().equals(user.getId())) throw new WorkflowConflictException("직접 등록한 습득물에는 반환을 요청할 수 없습니다.");
        ReturnRequest existing = returns.findFirstByFoundItem_IdAndStatusNotOrderByIdDesc(item.getId(), ReturnStatus.REJECTED).orElse(null);
        if (existing != null) {
            if (existing.getRequester().getId().equals(user.getId()) && existing.getStatus() != ReturnStatus.COMPLETED) return ReturnResponse.from(existing, user);
            throw new WorkflowConflictException("이미 다른 반환 요청이 진행 중이거나 반환이 완료된 물품입니다.");
        }
        if (item.getStatus() != FoundItemStatus.STORED) throw new WorkflowConflictException("반환 가능한 물품이 아닙니다.");
        if (!item.isOwnershipConfigured()) throw new WorkflowConflictException("습득자가 소유자 확인 질문을 설정한 뒤 반환을 요청할 수 있습니다.");
        LostItem linked = null;
        if (input.lostItemId() != null) {
            linked = lost.findLocked(input.lostItemId()).orElseThrow(() -> new ResourceNotFoundException("분실물을 찾을 수 없습니다."));
            if (!linked.getUser().getId().equals(user.getId())) throw new AccessDeniedException("본인의 분실물만 연결할 수 있습니다.");
            if (linked.getStatus() != LostItemStatus.LOST || !linked.getCategory().equals(item.getCategory()) ||
                    returns.existsByLostItem_IdAndStatusNot(linked.getId(), ReturnStatus.REJECTED))
                throw new WorkflowConflictException("연결할 분실물의 종류와 진행 상태를 확인해 주세요.");
        }
        ReturnRequest request = returns.saveAndFlush(new ReturnRequest(item, user, linked));
        activity.notify(user, "반환 요청 접수", "‘" + item.getTitle() + "’의 비공개 특징을 확인해 주세요.");
        activity.notify(item.getUser(), "새 반환 요청", "‘" + item.getTitle() + "’에 반환 요청이 도착했어요.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public ReturnResponse verifyOwner(String subject, Long id, String answer) {
        User user = users.require(subject); ReturnRequest request = lock(id); requireRequester(request, user);
        expected(request, ReturnStatus.PENDING);
        if (!proof.matches(answer, request.getFoundItem().ownershipAnswerHash()))
            throw new InvalidRequestParameterException("answer", "비공개 특징이 일치하지 않습니다.");
        request.transition(ReturnStatus.OWNER_VERIFIED);
        activity.notify(request.getFoundItem().getUser(), "소유자 확인 완료", "반환 요청을 검토하고 승인해 주세요.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public ReturnResponse approve(String subject, Long id) {
        User user = users.require(subject); ReturnRequest request = lock(id); requireManager(request, user);
        if (request.getStatus() == ReturnStatus.APPROVED) return ReturnResponse.from(request, user);
        expected(request, ReturnStatus.OWNER_VERIFIED);
        request.transition(ReturnStatus.APPROVED); issueQr(request);
        activity.notify(request.getRequester(), "반환 요청 승인", "반환 QR이 발급됐어요. 습득자에게 QR 인증 코드를 제시해 주세요.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public ReturnResponse renewQr(String subject, Long id) {
        User user = users.require(subject); ReturnRequest request = lock(id); requireManager(request, user);
        expected(request, ReturnStatus.APPROVED); issueQr(request);
        activity.notify(request.getRequester(), "반환 QR 재발급", "새 QR이 발급됐어요. 이전 코드는 사용할 수 없습니다.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public ReturnResponse verifyQr(String subject, Long id, String input) {
        User user = users.require(subject); ReturnRequest request = lock(id); requireManager(request, user);
        expected(request, ReturnStatus.APPROVED);
        String token = input.trim();
        String prefix = "LOSTQUEST:RETURN:" + id + ":";
        if (token.startsWith(prefix)) token = token.substring(prefix.length());
        if (request.getQrToken() == null || !MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),
                request.getQrToken().getBytes(StandardCharsets.UTF_8)))
            throw new InvalidRequestParameterException("token", "QR 인증 코드가 일치하지 않습니다.");
        if (!Instant.now().isBefore(request.getQrExpiresAt())) throw new WorkflowConflictException("QR 유효기간이 지났습니다. QR을 재발급해 주세요.");
        request.consumeQr();
        activity.notify(request.getRequester(), "QR 인증 완료", "습득자의 최종 반환 확인을 기다리고 있어요.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public ReturnResponse complete(String subject, Long id) {
        User user = users.require(subject); ReturnRequest request = lock(id); requireManager(request, user);
        if (request.getStatus() == ReturnStatus.COMPLETED) return ReturnResponse.from(request, user);
        expected(request, ReturnStatus.QR_VERIFIED);
        FoundItem item = found.findLocked(request.getFoundItem().getId()).orElseThrow();
        if (item.getStatus() != FoundItemStatus.STORED) throw new WorkflowConflictException("반환 가능한 물품이 아닙니다.");
        item.markReturned();
        if (request.getLostItem() != null) {
            LostItem linked = lost.findLocked(request.getLostItem().getId()).orElseThrow();
            if (linked.getStatus() != LostItemStatus.LOST) throw new WorkflowConflictException("연결된 분실물의 상태가 변경되었습니다.");
            linked.markReturned();
        }
        request.transition(ReturnStatus.COMPLETED);
        activity.returned(item.getUser(), request.getId(), item.getTitle());
        activity.notify(request.getRequester(), "반환 완료", "‘" + item.getTitle() + "’ 반환이 완료됐어요.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public ReturnResponse reject(String subject, Long id) {
        User user = users.require(subject); ReturnRequest request = lock(id); requireManager(request, user);
        if (request.getStatus() == ReturnStatus.REJECTED) return ReturnResponse.from(request, user);
        if (request.getStatus() == ReturnStatus.COMPLETED) throw new WorkflowConflictException("완료된 반환은 반려할 수 없습니다.");
        request.transition(ReturnStatus.REJECTED);
        activity.notify(request.getRequester(), "반환 요청 반려", "습득자 검토에서 요청이 반려됐어요.");
        return ReturnResponse.from(request, user);
    }
    @Transactional
    public FoundItemResponse configureOwnership(String subject, Long id, OwnershipSetupRequest input) {
        User user = users.require(subject);
        FoundItem item = found.findLocked(id).orElseThrow(() -> new ResourceNotFoundException("습득물을 찾을 수 없습니다."));
        if (!item.getUser().getId().equals(user.getId())) throw new AccessDeniedException("등록자만 질문을 설정할 수 있습니다.");
        if (item.getStatus() != FoundItemStatus.STORED ||
                returns.findFirstByFoundItem_IdAndStatusNotOrderByIdDesc(id, ReturnStatus.REJECTED).isPresent())
            throw new WorkflowConflictException("반환 요청이 진행 중이거나 완료된 물품의 질문은 변경할 수 없습니다.");
        item.configureOwnership(input.question().trim(), proof.encode(input.answer()));
        return FoundItemResponse.from(item);
    }
}

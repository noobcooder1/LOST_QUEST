package com.lostquest.service.matching;

import com.lostquest.dto.ItemMatchResponse;
import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;
import com.lostquest.entity.LostItem;
import com.lostquest.entity.User;
import com.lostquest.exception.ResourceNotFoundException;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.service.CurrentUserReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Recommends found items for one of the caller's lost items. Not transactional on purpose: the short DB reads
 * run in their own repository transactions and no connection is held while the 경찰청 API is called.
 */
@Service
public class MatchingService {

    private static final Logger log = LoggerFactory.getLogger(MatchingService.class);

    /** Candidates scoring below this are not recommended (e.g. same category but found weeks later scores 35). */
    public static final int MIN_SCORE = 40;
    public static final int DEFAULT_LIMIT = 10;
    public static final int MAX_LIMIT = 20;
    /** LOST QUEST found items searched: found from the lost date up to this many days later. */
    public static final int LOST_QUEST_WINDOW_DAYS = 30;

    private final LostItemRepository lostItemRepository;
    private final FoundItemRepository foundItemRepository;
    private final CurrentUserReader currentUserReader;
    private final PoliceCandidateCollector policeCandidateCollector;
    private final MatchingEngine engine;

    public MatchingService(LostItemRepository lostItemRepository, FoundItemRepository foundItemRepository,
                           CurrentUserReader currentUserReader, PoliceCandidateCollector policeCandidateCollector,
                           MatchingEngine engine) {
        this.lostItemRepository = lostItemRepository;
        this.foundItemRepository = foundItemRepository;
        this.currentUserReader = currentUserReader;
        this.policeCandidateCollector = policeCandidateCollector;
        this.engine = engine;
    }

    /** Only the author of the lost item may see its recommendations; the caller comes from the JWT subject. */
    public ItemMatchResponse findMatches(String authenticatedSubject, Long lostItemId, int limit) {
        User caller = currentUserReader.require(authenticatedSubject);
        LostItem lostItem = lostItemRepository.findWithUserById(lostItemId)
                .orElseThrow(() -> new ResourceNotFoundException("분실물을 찾을 수 없습니다. id: " + lostItemId));
        if (!lostItem.getUser().getId().equals(caller.getId())) {
            throw new AccessDeniedException("not the owner of lost item " + lostItemId);
        }
        int boundedLimit = Math.max(1, Math.min(limit, MAX_LIMIT));
        MatchRun run = run(lostItem, boundedLimit);
        return ItemMatchResponse.of(run.target(), engine.maxScore(), MIN_SCORE, boundedLimit, run.matches(), run.sources());
    }

    /** Ranked matches for a lost item plus how each source went; the caller has already checked ownership. */
    public record MatchRun(MatchTarget target, List<ScoredMatch> matches, List<SourceResult> sources) {
    }

    /**
     * The matching computation shared by the matching API and match notifications: collect candidates from
     * both sources independently, score them with the engine and keep the best {@code limit}. The lost item's
     * user must be loaded (e.g. via {@link LostItemRepository#findWithUserById}).
     */
    public MatchRun run(LostItem lostItem, int limit) {
        MatchTarget target = MatchTarget.of(lostItem);
        SourceResult lostQuest = collectLostQuest(target, lostItem.getUser().getId());
        SourceResult police = policeCandidateCollector.collect(target);

        List<MatchCandidate> candidates = new ArrayList<>(lostQuest.candidates());
        candidates.addAll(police.candidates());
        List<ScoredMatch> matches = engine.rank(target, candidates, MIN_SCORE, Math.max(1, Math.min(limit, MAX_LIMIT)));
        return new MatchRun(target, matches, List.of(lostQuest, police));
    }

    SourceResult collectLostQuest(MatchTarget target, Long callerId) {
        LocalDate from = target.lostDate();
        if (from == null) {
            return SourceResult.skipped(MatchSource.LOST_QUEST, "분실일을 확인할 수 없어 LOST QUEST 습득물을 검색하지 않았습니다.");
        }
        try {
            List<MatchCandidate> candidates = foundItemRepository
                    .findTop200ByStatusAndFoundDateBetweenAndUser_IdNotOrderByFoundDateAscIdAsc(
                            FoundItemStatus.STORED, from, from.plusDays(LOST_QUEST_WINDOW_DAYS), callerId)
                    .stream().map(MatchingService::toCandidate).toList();
            return SourceResult.ok(MatchSource.LOST_QUEST, candidates);
        } catch (DataAccessException ex) {
            log.warn("Matching: LOST QUEST candidates unavailable: {}", ex.getClass().getSimpleName());
            return SourceResult.unavailable(MatchSource.LOST_QUEST, "LOST QUEST 습득물을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
    }

    public static MatchCandidate toCandidate(FoundItem item) {
        return new MatchCandidate(
                MatchSource.LOST_QUEST,
                "LOST_QUEST:" + item.getId(),
                item.getId(),
                null,
                null,
                item.getTitle(),
                item.getCategory(),
                item.getColor(),
                item.getFoundDate(),
                item.getRegion(),
                item.getLocation(),
                null,
                item.getImageUrl());
    }
}

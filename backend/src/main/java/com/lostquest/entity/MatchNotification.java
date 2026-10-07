package com.lostquest.entity;

import com.lostquest.service.matching.MatchSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;

/**
 * "A new found-item candidate matches your lost item." One row per (lost item, candidate): the unique constraint
 * is what prevents duplicate notifications, also under concurrent requests. The found item's title, date and
 * score are a snapshot taken when the match was found; 경찰청 data itself is not stored.
 */
@Entity
@Table(name = "match_notifications",
        uniqueConstraints = @UniqueConstraint(name = "uk_match_notification_lost_candidate",
                columnNames = {"lost_item_id", "candidate_key"}),
        indexes = @Index(name = "idx_match_notification_user_read", columnList = "user_id, read_at"))
public class MatchNotification extends BaseEntity {

    public static final int TITLE_MAX = 120;

    /** The recipient: always the owner of the lost item, set by the server. */
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lost_item_id", nullable = false)
    private LostItem lostItem;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MatchSource source;

    /** Same stable id as the matching API: "LOST_QUEST:{id}" or "POLICE:{atcId}-{fdSn}". */
    @NotNull
    @Size(max = 64)
    @Column(name = "candidate_key", nullable = false, length = 64)
    private String candidateKey;

    /** LOST QUEST found item id (LOST_QUEST only). */
    @Column(name = "found_item_id")
    private Long foundItemId;

    /** 경찰청 관리번호 and 습득 순번 (POLICE only), validated before storing. */
    @Size(max = 20)
    @Column(name = "atc_id", length = 20)
    private String atcId;

    @Column(name = "fd_sn")
    private Integer fdSn;

    @Size(max = TITLE_MAX)
    @Column(name = "found_title", length = TITLE_MAX)
    private String foundTitle;

    @Column(name = "found_date")
    private LocalDate foundDate;

    @Column(nullable = false)
    private int score;

    @Column(name = "max_score", nullable = false)
    private int maxScore;

    @Column(name = "read_at")
    private Instant readAt;

    protected MatchNotification() {
    }

    public MatchNotification(User user, LostItem lostItem, MatchSource source, String candidateKey, Long foundItemId,
                             String atcId, Integer fdSn, String foundTitle, LocalDate foundDate, int score, int maxScore) {
        this.user = user;
        this.lostItem = lostItem;
        this.source = source;
        this.candidateKey = candidateKey;
        this.foundItemId = foundItemId;
        this.atcId = atcId;
        this.fdSn = fdSn;
        this.foundTitle = foundTitle;
        this.foundDate = foundDate;
        this.score = score;
        this.maxScore = maxScore;
    }

    /** Idempotent: the first read time is kept. */
    public void markRead(Instant now) {
        if (readAt == null) {
            readAt = now;
        }
    }

    public User getUser() {
        return user;
    }

    public LostItem getLostItem() {
        return lostItem;
    }

    public MatchSource getSource() {
        return source;
    }

    public String getCandidateKey() {
        return candidateKey;
    }

    public Long getFoundItemId() {
        return foundItemId;
    }

    public String getAtcId() {
        return atcId;
    }

    public Integer getFdSn() {
        return fdSn;
    }

    public String getFoundTitle() {
        return foundTitle;
    }

    public LocalDate getFoundDate() {
        return foundDate;
    }

    public int getScore() {
        return score;
    }

    public int getMaxScore() {
        return maxScore;
    }

    public Instant getReadAt() {
        return readAt;
    }
}

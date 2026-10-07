package com.lostquest.service.matching;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * Found date close after the lost date. Policy (days from lost date to found date):
 * same day 20, 1–3 days 18, 4–7 days 12, 8–14 days 6, 15+ days 0. Found before it was lost: 0 (MISMATCH).
 * A missing date is UNKNOWN rather than a failure of the whole recommendation.
 */
@Component
@Order(4)
public class DateCriterion implements MatchCriterion {

    public static final int MAX_POINTS = 20;
    static final int POINTS_WITHIN_3_DAYS = 18;
    static final int POINTS_WITHIN_7_DAYS = 12;
    static final int POINTS_WITHIN_14_DAYS = 6;

    @Override
    public String key() {
        return "date";
    }

    @Override
    public int maxPoints() {
        return MAX_POINTS;
    }

    @Override
    public CriterionResult evaluate(MatchTarget target, MatchCandidate candidate) {
        Long days = daysAfterLoss(target.lostDate(), candidate.foundDate());
        if (days == null) {
            return CriterionResult.unknown(MAX_POINTS, "날짜 정보가 없습니다.");
        }
        int points = pointsFor(days);
        if (points == 0) {
            return CriterionResult.mismatch(MAX_POINTS);
        }
        String reason = days == 0 ? "분실 당일 습득" : "분실 " + days + "일 후 습득";
        return CriterionResult.awarded(points, MAX_POINTS, reason);
    }

    /** Days from lost to found date, or null when either is missing. Negative when found before lost. */
    public static Long daysAfterLoss(LocalDate lostDate, LocalDate foundDate) {
        return lostDate == null || foundDate == null ? null : ChronoUnit.DAYS.between(lostDate, foundDate);
    }

    static int pointsFor(long days) {
        if (days < 0) {
            return 0;
        }
        if (days == 0) {
            return MAX_POINTS;
        }
        if (days <= 3) {
            return POINTS_WITHIN_3_DAYS;
        }
        if (days <= 7) {
            return POINTS_WITHIN_7_DAYS;
        }
        if (days <= 14) {
            return POINTS_WITHIN_14_DAYS;
        }
        return 0;
    }
}

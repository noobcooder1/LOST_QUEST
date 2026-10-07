package com.lostquest.service.matching;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Text normalization rules shared by the criteria. These are general rules applied to whatever names the data
 * (or the live 경찰청 common codes) contains, not a hand-written mapping table.
 */
public final class MatchText {

    private MatchText() {
    }

    /** Trim, drop inner whitespace, lower-case latin letters. Null or blank becomes null. */
    public static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String compact = value.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
        return compact.isEmpty() ? null : compact;
    }

    /**
     * Color names to compare. A trailing "색" is dropped ("갈색" → "갈", "검정색" → "검정") and a 경찰청 style name is
     * split into the part before and inside parentheses ("블랙(검정)" → "블랙", "검정"; "브라운(갈)" → "브라운", "갈").
     */
    public static List<String> colorTokens(String value) {
        String text = normalize(value);
        List<String> tokens = new ArrayList<>();
        if (text == null) {
            return tokens;
        }
        int open = text.indexOf('(');
        int close = open < 0 ? -1 : text.indexOf(')', open + 1);
        if (open >= 0 && close > open) {
            addColorToken(tokens, text.substring(0, open));
            addColorToken(tokens, text.substring(open + 1, close));
        } else {
            addColorToken(tokens, text);
        }
        return tokens;
    }

    private static void addColorToken(List<String> tokens, String token) {
        String stripped = token.endsWith("색") && token.length() > 1 ? token.substring(0, token.length() - 1) : token;
        if (!stripped.isEmpty() && !tokens.contains(stripped)) {
            tokens.add(stripped);
        }
    }

    /**
     * Whether an official region name (e.g. 경찰청 "서울특별시", "충청북도", "전남광주통합특별시") denotes a LOST QUEST
     * short region name (서울, 충북, 전남 ...). Rule: the names are equal, the official name contains the short name,
     * or the official name is a four-letter "…도" whose standard abbreviation (first + third letter, 충청북도 → 충북)
     * equals it.
     */
    public static boolean regionDenotes(String officialName, String shortName) {
        String official = normalize(officialName);
        String shortForm = normalize(shortName);
        if (official == null || shortForm == null) {
            return false;
        }
        if (official.contains(shortForm)) {
            return true;
        }
        return official.length() == 4 && official.endsWith("도")
                && shortForm.length() == 2
                && shortForm.charAt(0) == official.charAt(0) && shortForm.charAt(1) == official.charAt(2);
    }
}

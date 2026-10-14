package com.lostquest.service;

import com.lostquest.exception.InvalidRequestParameterException;
import java.util.regex.Pattern;

/** Posts are plain public text. This catches common contact formats, not every possible personal detail. */
public final class CommunityTextRules {
    private static final Pattern CONTACT = Pattern.compile("(?i)[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}|(?<!\\d)01[016789][ -]?\\d{3,4}[ -]?\\d{4}(?!\\d)");
    private CommunityTextRules() {}
    public static void publicText(String... values) {
        for (String value : values) {
            if (value == null) continue;
            if (value.indexOf('<') >= 0 || value.indexOf('>') >= 0 || value.indexOf('\0') >= 0)
                throw new InvalidRequestParameterException("post", "공개 게시글에는 HTML 태그를 사용할 수 없습니다.");
            if (CONTACT.matcher(value).find())
                throw new InvalidRequestParameterException("post", "공개 게시글에 이메일·휴대전화 번호를 쓰지 말고 비공개 질문을 이용해 주세요.");
        }
    }
}

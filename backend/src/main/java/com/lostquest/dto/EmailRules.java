package com.lostquest.dto;

/** Public email syntax, without restricting users to particular providers. No mailbox existence check. */
public final class EmailRules {
    public static final String PATTERN = "^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$";
    public static final String MESSAGE = "아이디@도메인.com과 같은 올바른 이메일 주소를 입력해 주세요.";
    private EmailRules() {}
}

package com.lostquest.exception;

/** A query parameter that passes type conversion but breaks a cross-field rule (e.g. from after to). */
public class InvalidRequestParameterException extends RuntimeException {
    private final String field;

    public InvalidRequestParameterException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}

package com.lostquest.exception;

/**
 * A wrong ownership answer. Same 400 response shape as before (field "answer"), but a distinct type so the attempt
 * counter is committed instead of rolled back with the failed request. The message never reveals the answer.
 */
public class OwnershipAnswerRejectedException extends InvalidRequestParameterException {
    public OwnershipAnswerRejectedException(String message) {
        super("answer", message);
    }
}

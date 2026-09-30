package com.lostquest.exception;

public class ImageTooLargeException extends RuntimeException {
    public static final String MESSAGE = "이미지는 10MB 이하만 업로드할 수 있어요.";

    public ImageTooLargeException() {
        super(MESSAGE);
    }
}

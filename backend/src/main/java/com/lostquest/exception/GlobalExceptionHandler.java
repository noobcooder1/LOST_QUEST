package com.lostquest.exception;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(WorkflowConflictException.class)
    public ResponseEntity<ApiError> handleWorkflowConflict(WorkflowConflictException ex, HttpServletRequest request) {
        return ResponseEntity.status(409).body(ApiError.of(409, "WORKFLOW_CONFLICT", ex.getMessage(), request.getRequestURI()));
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        return ResponseEntity.status(404).body(ApiError.of(404, "NOT_FOUND", ex.getMessage(), request.getRequestURI()));
    }

    @ExceptionHandler(AuthenticationFailedException.class)
    public ResponseEntity<ApiError> handleAuthenticationFailed(AuthenticationFailedException ex, HttpServletRequest request) {
        return ResponseEntity.status(401).body(ApiError.of(401, ex.getCode(), ex.getMessage(), request.getRequestURI()));
    }

    @ExceptionHandler(DuplicateEmailException.class)
    public ResponseEntity<ApiError> handleDuplicateEmail(DuplicateEmailException ex, HttpServletRequest request) {
        return ResponseEntity.status(409).body(ApiError.of(409, "EMAIL_ALREADY_EXISTS", ex.getMessage(), request.getRequestURI()));
    }

    /** 경찰청 OpenAPI failures. Only the kind and a key-free detail are logged; never the request URL. */
    @ExceptionHandler(ExternalApiException.class)
    public ResponseEntity<ApiError> handleExternalApi(ExternalApiException ex, HttpServletRequest request) {
        log.warn("External API failure {}: {}", ex.getKind(), ex.getDetail());
        ExternalApiException.Kind kind = ex.getKind();
        return ResponseEntity.status(kind.status()).body(ApiError.of(kind.status(), kind.code(), kind.message(), request.getRequestURI()));
    }

    @ExceptionHandler(InvalidRequestParameterException.class)
    public ResponseEntity<ApiError> handleInvalidParameter(InvalidRequestParameterException ex, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(new ApiError(Instant.now(), 400, "VALIDATION_ERROR", "입력값을 확인해 주세요.",
                request.getRequestURI(), List.of(new ApiError.FieldViolation(ex.getField(), ex.getMessage()))));
    }

    @ExceptionHandler(InvalidImageException.class)
    public ResponseEntity<ApiError> handleInvalidImage(InvalidImageException ex, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(ApiError.of(400, "INVALID_IMAGE", ex.getMessage(), request.getRequestURI()));
    }

    @ExceptionHandler(ImageTooLargeException.class)
    public ResponseEntity<ApiError> handleImageTooLarge(ImageTooLargeException ex, HttpServletRequest request) {
        return ResponseEntity.status(413).body(ApiError.of(413, "IMAGE_TOO_LARGE", ex.getMessage(), request.getRequestURI()));
    }

    /** Malformed multipart bodies are client errors, not 500s. */
    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiError> handleMultipart(MultipartException ex, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(ApiError.of(400, "INVALID_REQUEST",
                "요청 경로, 방식 및 입력값을 확인해 주세요.", request.getRequestURI()));
    }

    // Method-security failures surface inside MVC; without these the catch-all below would return 500.
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiError> handleSecurityAuthentication(AuthenticationException ex, HttpServletRequest request) {
        return ResponseEntity.status(401).body(ApiError.of(401, "UNAUTHORIZED", "인증이 필요한 요청입니다.", request.getRequestURI()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        return ResponseEntity.status(403).body(ApiError.of(403, "FORBIDDEN", "허용되지 않은 요청입니다.", request.getRequestURI()));
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<ApiError.FieldViolation> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiError.FieldViolation(error.getField(), error.getDefaultMessage())).toList();
        ApiError body = new ApiError(Instant.now(), 400, "VALIDATION_ERROR", "입력값을 확인해 주세요.", path(request), errors);
        return new ResponseEntity<>(body, headers, status);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> handleConstraintViolation(ConstraintViolationException ex, HttpServletRequest request) {
        List<ApiError.FieldViolation> errors = ex.getConstraintViolations().stream()
                .map(error -> new ApiError.FieldViolation(error.getPropertyPath().toString(), error.getMessage())).toList();
        return ResponseEntity.badRequest().body(new ApiError(Instant.now(), 400, "VALIDATION_ERROR",
                "입력값을 확인해 주세요.", request.getRequestURI(), errors));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleConflict(DataIntegrityViolationException ex, HttpServletRequest request) {
        return ResponseEntity.status(409).body(ApiError.of(409, "DATA_CONFLICT",
                "이미 존재하거나 참조 관계와 충돌하는 데이터입니다.", request.getRequestURI()));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiError> handleDatabaseFailure(DataAccessException ex, HttpServletRequest request) {
        log.error("Database access failed: {}", ex.getClass().getSimpleName());
        return ResponseEntity.status(503).body(ApiError.of(503, "DATABASE_UNAVAILABLE",
                "데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", request.getRequestURI()));
    }

    /** Raised by the servlet multipart limits (spring.servlet.multipart.*) before the controller runs. */
    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(MaxUploadSizeExceededException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return new ResponseEntity<>(ApiError.of(413, "IMAGE_TOO_LARGE", ImageTooLargeException.MESSAGE, path(request)),
                headers, HttpStatusCode.valueOf(413));
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String code = switch (status.value()) {
            case 400 -> "INVALID_REQUEST";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> "REQUEST_ERROR";
        };
        return new ResponseEntity<>(ApiError.of(status.value(), code,
                "요청 경로, 방식 및 입력값을 확인해 주세요.", path(request)), headers, status);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unexpected API error", ex);
        return ResponseEntity.internalServerError().body(ApiError.of(500, "INTERNAL_ERROR",
                "서버에서 요청을 처리하지 못했습니다.", request.getRequestURI()));
    }

    private String path(WebRequest request) {
        return ((ServletWebRequest) request).getRequest().getRequestURI();
    }
}

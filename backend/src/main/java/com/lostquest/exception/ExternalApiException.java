package com.lostquest.exception;

/**
 * A failure of an external system (the 경찰청 OpenAPI). Messages are written for users and must never
 * contain service keys or request URLs; the cause is kept only for the stack trace category.
 */
public class ExternalApiException extends RuntimeException {

    public enum Kind {
        NOT_CONFIGURED(503, "EXTERNAL_API_NOT_CONFIGURED", "경찰청 공공데이터 연동이 설정되지 않았습니다."),
        TIMEOUT(504, "EXTERNAL_API_TIMEOUT", "경찰청 공공데이터 서버의 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."),
        UNAVAILABLE(502, "EXTERNAL_API_UNAVAILABLE", "경찰청 공공데이터 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."),
        AUTH_FAILED(502, "EXTERNAL_API_AUTH_ERROR", "경찰청 공공데이터 인증에 실패했습니다. 서버 설정을 확인해야 합니다."),
        RATE_LIMITED(503, "EXTERNAL_API_RATE_LIMITED", "경찰청 공공데이터 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."),
        UPSTREAM_ERROR(502, "EXTERNAL_API_ERROR", "경찰청 공공데이터 서버가 요청을 처리하지 못했습니다. 검색 범위를 좁혀 다시 시도해 주세요."),
        INVALID_RESPONSE(502, "EXTERNAL_API_INVALID_RESPONSE", "경찰청 공공데이터 응답을 해석할 수 없습니다.");

        private final int status;
        private final String code;
        private final String message;

        Kind(int status, String code, String message) {
            this.status = status;
            this.code = code;
            this.message = message;
        }

        public int status() {
            return status;
        }

        public String code() {
            return code;
        }

        public String message() {
            return message;
        }
    }

    private final Kind kind;
    /** Short, key-free description for server logs (e.g. "lost list: resultCode=99"). */
    private final String detail;

    public ExternalApiException(Kind kind, String detail) {
        super(kind.message());
        this.kind = kind;
        this.detail = detail;
    }

    public Kind getKind() {
        return kind;
    }

    public String getDetail() {
        return detail;
    }
}

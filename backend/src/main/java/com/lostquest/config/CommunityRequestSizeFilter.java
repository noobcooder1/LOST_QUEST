package com.lostquest.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.exception.ApiError;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** JSON posts/correspondence are small. Multipart images keep their existing 10/11 MiB limits. */
@Component @Order(10)
public class CommunityRequestSizeFilter extends OncePerRequestFilter {
    private static final int MAX_JSON_BYTES = 16 * 1024;
    private final ObjectMapper mapper;
    public CommunityRequestSizeFilter(ObjectMapper mapper) { this.mapper = mapper; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath().isEmpty() ? request.getRequestURI() : request.getServletPath();
        boolean write = request.getMethod().equals("POST") || request.getMethod().equals("PUT");
        boolean community = path.startsWith("/api/community/");
        boolean itemJson = (path.equals("/api/lost-items") || path.startsWith("/api/lost-items/")
            || path.equals("/api/found-items") || path.startsWith("/api/found-items/"))
            && request.getContentType() != null && request.getContentType().startsWith("application/json");
        return !write || (!community && !itemJson);
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        byte[] body = request.getContentLengthLong() > MAX_JSON_BYTES ? null : request.getInputStream().readNBytes(MAX_JSON_BYTES + 1);
        if (body == null || body.length > MAX_JSON_BYTES) {
            response.setStatus(413); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
            mapper.writeValue(response.getWriter(), ApiError.of(413, "REQUEST_TOO_LARGE", "요청 본문은 16 KiB 이하로 보내 주세요.", request.getRequestURI()));
            return;
        }
        chain.doFilter(new HttpServletRequestWrapper(request) {
            @Override public ServletInputStream getInputStream() {
                ByteArrayInputStream bytes = new ByteArrayInputStream(body);
                return new ServletInputStream() {
                    @Override public int read() { return bytes.read(); }
                    @Override public boolean isFinished() { return bytes.available() == 0; }
                    @Override public boolean isReady() { return true; }
                    @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException("Synchronous requests only"); }
                };
            }
            @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8)); }
        }, response);
    }
}

package com.lostquest.service;

import com.lostquest.exception.ExternalApiException;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.SocketTimeoutException;

/** Fixed HTTPS police attachment host, no redirects, credentials, retries or user-selected headers. */
@Component
public class PolicePhotoDownloader {
    public static final int MAX_BYTES = 10 * 1024 * 1024;
    static final int TOTAL_TIMEOUT_MS = 10_000;
    public record Download(byte[] bytes, String contentType) {}

    public Download download(String url) {
        String safe = PoliceImagePolicy.safeImageUrl(url);
        if (safe == null) throw new IllegalArgumentException("Invalid police photo URL");
        try {
            return read((HttpURLConnection) URI.create(safe).toURL().openConnection());
        } catch (SocketTimeoutException ex) {
            throw new ExternalApiException(ExternalApiException.Kind.TIMEOUT, "police photo timeout");
        } catch (IOException ex) {
            throw new ExternalApiException(ExternalApiException.Kind.UNAVAILABLE, "police photo connection failure");
        }
    }

    /** Package-private for transport tests; production connections only come from the fixed URL policy above. */
    Download read(HttpURLConnection connection) throws IOException {
        long deadline = System.nanoTime() + TOTAL_TIMEOUT_MS * 1_000_000L;
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(3_000);
        connection.setReadTimeout(5_000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "image/jpeg,image/png,image/webp");
        try {
            int status = connection.getResponseCode();
            if (status != 200) throw invalid("police photo HTTP " + status);
            String type = connection.getContentType();
            if (type == null || !type.toLowerCase(java.util.Locale.ROOT).matches("image/(jpeg|jpg|png|webp)(;.*)?")) throw invalid("police photo content type");
            if (connection.getContentLengthLong() > MAX_BYTES) throw invalid("police photo too large");
            try (var input = connection.getInputStream(); var output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                while (true) {
                    long remainingMs = (deadline - System.nanoTime()) / 1_000_000;
                    if (remainingMs <= 0) throw new SocketTimeoutException("photo deadline");
                    connection.setReadTimeout((int) Math.min(5_000, remainingMs));
                    int read = input.read(buffer);
                    if (read < 0) break;
                    if (output.size() + read > MAX_BYTES) throw invalid("police photo too large");
                    output.write(buffer, 0, read);
                }
                if (output.size() == 0) throw invalid("empty police photo");
                return new Download(output.toByteArray(), type.split(";")[0].toLowerCase(java.util.Locale.ROOT).replace("image/jpg", "image/jpeg"));
            }
        } finally { connection.disconnect(); }
    }
    private static ExternalApiException invalid(String detail) { return new ExternalApiException(ExternalApiException.Kind.INVALID_RESPONSE, detail); }
}

package com.lostquest.service;

import com.lostquest.security.JwtProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Return QR credentials without storing them. The database keeps only a random per-issue nonce; the token shown to
 * the requester is HMAC-SHA256(key, "v1:{returnId}:{nonce}"). Someone who can read the database therefore cannot
 * produce a valid token, while the server can still show the same QR to the requester again (page refresh).
 * The token is bound to the return request id, so it never verifies for another request, and a new nonce on
 * renewal invalidates the previous token.
 * The HMAC key is derived from the server secret with a fixed label, so it is separate from the JWT signing key.
 */
@Component
public class ReturnQrTokens {

    private static final String KEY_LABEL = "lostquest:return-qr:v1";
    private static final Base64.Encoder BASE64URL = Base64.getUrlEncoder().withoutPadding();

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public ReturnQrTokens(JwtProperties jwtProperties) {
        this.key = new SecretKeySpec(hmac(new SecretKeySpec(jwtProperties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"),
                KEY_LABEL), "HmacSHA256");
    }

    /** 256 random bits, stored per issue. */
    public String newNonce() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return BASE64URL.encodeToString(bytes);
    }

    public String token(Long returnId, String nonce) {
        return BASE64URL.encodeToString(hmac(key, "v1:" + returnId + ":" + nonce));
    }

    /** Constant-time comparison; false for missing values. */
    public boolean matches(Long returnId, String nonce, String presented) {
        if (returnId == null || nonce == null || presented == null) {
            return false;
        }
        return MessageDigest.isEqual(token(returnId, nonce).getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] hmac(SecretKeySpec key, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HmacSHA256 unavailable", ex);
        }
    }
}

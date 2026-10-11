package com.lostquest.service;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
@Component
public class OwnershipProof {
    private final PasswordEncoder encoder;
    public OwnershipProof(PasswordEncoder encoder) { this.encoder = encoder; }
    private String digest(String answer) {
        try {
            String normalized = answer.trim().replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    public String encode(String answer) { return encoder.encode(digest(answer)); }
    public boolean matches(String answer, String hash) { return hash != null && encoder.matches(digest(answer), hash); }
}

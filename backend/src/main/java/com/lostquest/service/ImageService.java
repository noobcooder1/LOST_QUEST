package com.lostquest.service;

import com.lostquest.exception.ImageTooLargeException;
import com.lostquest.exception.InvalidImageException;
import com.lostquest.exception.ResourceNotFoundException;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Validates uploaded item images and stores them under server-generated names. The database keeps
 * only the server-relative URL ({@code /api/images/<uuid>.<ext>}); file system paths never leave here.
 */
@Service
public class ImageService {

    public static final long MAX_BYTES = 10L * 1024 * 1024;
    public static final String URL_PREFIX = "/api/images/";
    private static final Pattern KEY = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)");
    private static final String INVALID_FORMAT = "JPEG, PNG, WebP 이미지만 업로드할 수 있어요.";

    private final ImageStorage storage;

    public ImageService(ImageStorage storage) {
        this.storage = storage;
    }

    /**
     * Stores the image for an item being created in the caller's transaction and returns its
     * server-relative URL. If that transaction does not commit (e.g. the INSERT fails), the file is
     * deleted so no orphan remains.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String storeForNewItem(MultipartFile file) {
        if (file.getSize() > MAX_BYTES) {
            throw new ImageTooLargeException();
        }
        byte[] content = readBytes(file);
        if (content.length == 0) {
            throw new InvalidImageException("비어 있는 파일은 업로드할 수 없어요.");
        }
        if (content.length > MAX_BYTES) {
            throw new ImageTooLargeException();
        }
        ImageType detected = ImageType.detect(content);
        if (detected == null || !detected.acceptsDeclared(file.getContentType())) {
            // The declared Content-Type is client-controlled, so it must also agree with the file signature.
            throw new InvalidImageException(INVALID_FORMAT);
        }

        String key = UUID.randomUUID() + "." + detected.extension;
        storage.save(key, content);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    storage.delete(key);
                }
            }
        });
        return URL_PREFIX + key;
    }

    /** Only server-generated key shapes are looked up, so traversal such as {@code ../x} cannot reach storage. */
    public StoredImage load(String key) {
        if (key == null || !KEY.matcher(key).matches()) {
            throw notFound();
        }
        Resource resource = storage.load(key).orElseThrow(ImageService::notFound);
        return new StoredImage(resource, ImageType.fromExtension(key.substring(key.lastIndexOf('.') + 1)).mediaType);
    }

    private static ResourceNotFoundException notFound() {
        return new ResourceNotFoundException("이미지를 찾을 수 없습니다.");
    }

    private static byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new UncheckedIOException("Failed to read uploaded image", ex);
        }
    }

    public record StoredImage(Resource resource, MediaType mediaType) {
    }

    private enum ImageType {
        JPEG("jpg", MediaType.IMAGE_JPEG, Set.of("image/jpeg", "image/jpg", "image/pjpeg")),
        PNG("png", MediaType.IMAGE_PNG, Set.of("image/png")),
        WEBP("webp", MediaType.parseMediaType("image/webp"), Set.of("image/webp"));

        private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

        final String extension;
        final MediaType mediaType;
        final Set<String> declaredTypes;

        ImageType(String extension, MediaType mediaType, Set<String> declaredTypes) {
            this.extension = extension;
            this.mediaType = mediaType;
            this.declaredTypes = declaredTypes;
        }

        /** Magic numbers: JPEG FF D8 FF, PNG 8-byte signature, WebP "RIFF" ???? "WEBP". */
        static ImageType detect(byte[] b) {
            if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
                return JPEG;
            }
            if (b.length >= 8 && Arrays.equals(b, 0, 8, PNG_SIGNATURE, 0, 8)) {
                return PNG;
            }
            if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                    && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
                return WEBP;
            }
            return null;
        }

        static ImageType fromExtension(String extension) {
            for (ImageType type : values()) {
                if (type.extension.equals(extension)) {
                    return type;
                }
            }
            throw new IllegalArgumentException("Unknown image extension");
        }

        boolean acceptsDeclared(String contentType) {
            if (contentType == null) {
                return false;
            }
            String base = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
            return declaredTypes.contains(base);
        }
    }
}

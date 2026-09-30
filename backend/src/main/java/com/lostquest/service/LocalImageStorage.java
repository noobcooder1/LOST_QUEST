package com.lostquest.service;

import com.lostquest.config.ImageStorageProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;

/** Development storage under a configurable directory (default ./.local/uploads, gitignored). */
@Component
public class LocalImageStorage implements ImageStorage {
    private static final Logger log = LoggerFactory.getLogger(LocalImageStorage.class);

    private final Path baseDir;

    public LocalImageStorage(ImageStorageProperties properties) {
        this.baseDir = Paths.get(properties.localDir()).toAbsolutePath().normalize();
    }

    @Override
    public void save(String key, byte[] content) {
        Path target = resolve(key);
        try {
            Files.createDirectories(baseDir);
            // Write to a temporary name first so a crash never leaves a half-written image under a real key.
            Path temp = baseDir.resolve(".upload-" + UUID.randomUUID() + ".tmp");
            try {
                Files.write(temp, content);
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Failed to store image", ex);
        }
    }

    @Override
    public Optional<Resource> load(String key) {
        Path path = resolve(key);
        return Files.isRegularFile(path) ? Optional.of(new PathResource(path)) : Optional.empty();
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException ex) {
            log.warn("Could not delete stored image {}: {}", key, ex.getClass().getSimpleName());
        }
    }

    /** Defense in depth: keys are validated by ImageService, and must still resolve directly inside baseDir. */
    private Path resolve(String key) {
        Path path = baseDir.resolve(key).normalize();
        if (!baseDir.equals(path.getParent())) {
            throw new IllegalArgumentException("Invalid image key");
        }
        return path;
    }
}

package com.lostquest.service;

import org.springframework.core.io.Resource;

import java.util.Optional;

/**
 * Where validated image bytes live. Keys are server-generated file names such as
 * {@code 3f2b...e1.jpg}; implementations never see client file names. The local file system is used
 * in development; an S3 implementation can replace it without changing callers.
 */
public interface ImageStorage {

    void save(String key, byte[] content);

    Optional<Resource> load(String key);

    /** Best effort: missing keys are ignored so cleanup can run safely more than once. */
    void delete(String key);
}

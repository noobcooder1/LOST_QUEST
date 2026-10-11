package com.lostquest.service;

import org.springframework.core.io.Resource;

import java.util.Optional;

/**
 * Where validated image bytes live. Keys are server-generated file names such as
 * {@code 3f2b...e1.jpg}; implementations never see client file names. The primary implementation stores bytes in MySQL; local files remain only for legacy reads.
 */
public interface ImageStorage {

    void save(String key, byte[] content);

    Optional<Resource> load(String key);

    /** Best effort: missing keys are ignored so cleanup can run safely more than once. */
    void delete(String key);
}

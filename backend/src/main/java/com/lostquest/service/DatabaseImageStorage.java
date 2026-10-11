package com.lostquest.service;
import com.lostquest.entity.ItemImage;
import com.lostquest.repository.ItemImageRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Optional;
/** Validated images share the item's DB transaction. Old files are retained and copied into the DB on read. */
@Component
@Primary
public class DatabaseImageStorage implements ImageStorage {
    private final ItemImageRepository images;
    private final LocalImageStorage legacy;
    public DatabaseImageStorage(ItemImageRepository images, LocalImageStorage legacy) { this.images = images; this.legacy = legacy; }
    @Override @Transactional
    public void save(String key, byte[] content) { images.save(new ItemImage(key, content)); }
    @Override @Transactional
    public Optional<Resource> load(String key) {
        Optional<ItemImage> stored = images.findById(key);
        if (stored.isPresent()) return Optional.of(new ByteArrayResource(stored.get().getContent()));
        Optional<Resource> file = legacy.load(key);
        if (file.isEmpty()) return Optional.empty();
        try {
            byte[] bytes = file.get().getContentAsByteArray();
            if (bytes.length > ImageService.MAX_BYTES) return Optional.empty();
            images.save(new ItemImage(key, bytes));
            return Optional.of(new ByteArrayResource(bytes));
        } catch (IOException ex) { throw new UncheckedIOException(ex); }
    }
    @Override @Transactional
    public void delete(String key) { images.deleteById(key); }
}

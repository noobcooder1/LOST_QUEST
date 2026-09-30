package com.lostquest.controller;

import com.lostquest.service.ImageService;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/** Public read access to item images by their server-generated name; storage paths are never exposed. */
@RestController
@RequestMapping("/api/images")
public class ImageController {

    private final ImageService imageService;

    public ImageController(ImageService imageService) {
        this.imageService = imageService;
    }

    @GetMapping("/{filename}")
    public ResponseEntity<Resource> getImage(@PathVariable String filename) {
        ImageService.StoredImage image = imageService.load(filename);
        return ResponseEntity.ok()
                .contentType(image.mediaType())
                // Names are random UUIDs and files are never overwritten, so they can be cached for a long time.
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .body(image.resource());
    }
}

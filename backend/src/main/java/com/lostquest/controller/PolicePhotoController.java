package com.lostquest.controller;

import com.lostquest.service.PolicePhotoService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
public class PolicePhotoController {
    private final PolicePhotoService photos;
    public PolicePhotoController(PolicePhotoService photos) { this.photos = photos; }

    /** Authenticated, fixed-host image bytes for browser-only inference; never an open HTTP proxy. */
    @GetMapping("/api/public-items/image")
    public ResponseEntity<byte[]> image(@RequestParam String url) {
        var cached = photos.get(url);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(cached.photo().contentType()))
                .contentLength(cached.photo().bytes().length)
                .cacheControl(CacheControl.maxAge(Duration.ofHours(12)).cachePrivate())
                .header("X-Police-Image-Cache", cached.hit() ? "HIT" : "MISS")
                .body(cached.photo().bytes());
    }
}

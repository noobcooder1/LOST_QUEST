package com.lostquest.controller;

import com.lostquest.dto.*;
import com.lostquest.service.CommunityPostService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController @Validated
@RequestMapping("/api/community/posts")
public class CommunityPostController {
    private final CommunityPostService service;
    public CommunityPostController(CommunityPostService service) { this.service = service; }

    @GetMapping
    public CommunityPage<CommunityPostResponse> list(@RequestParam(required = false) @Size(max = 10) String category,
            @RequestParam(required = false) @Size(max = 100) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page) {
        return service.list(category, q, from, to, page);
    }

    @GetMapping("/{id}")
    public CommunityPostResponse detail(@PathVariable @Positive Long id) { return service.detail(id); }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE) @ResponseStatus(HttpStatus.CREATED)
    public CommunityPostResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateCommunityPostRequest input) {
        return service.create(jwt.getSubject(), input, null);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE) @ResponseStatus(HttpStatus.CREATED)
    public CommunityPostResponse createWithImage(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("post") CreateCommunityPostRequest input,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        return service.create(jwt.getSubject(), input, image);
    }
}

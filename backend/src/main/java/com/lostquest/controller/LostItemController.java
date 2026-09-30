package com.lostquest.controller;

import com.lostquest.dto.CreateLostItemRequest;
import com.lostquest.dto.LostItemResponse;
import com.lostquest.service.LostItemService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/lost-items")
public class LostItemController {

    private final LostItemService lostItemService;

    public LostItemController(LostItemService lostItemService) {
        this.lostItemService = lostItemService;
    }

    @GetMapping
    public List<LostItemResponse> getLostItems() {
        return lostItemService.findAll();
    }

    @GetMapping("/{id}")
    public LostItemResponse getLostItem(@PathVariable @Positive Long id) {
        return lostItemService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LostItemResponse createLostItem(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateLostItemRequest request) {
        return lostItemService.create(jwt.getSubject(), request);
    }

    /** Multipart variant: "item" is the same JSON as above (sent as application/json), "image" is optional. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public LostItemResponse createLostItemWithImage(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("item") CreateLostItemRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        return lostItemService.create(jwt.getSubject(), request, image);
    }
}

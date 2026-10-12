package com.lostquest.controller;

import com.lostquest.dto.CreateFoundItemRequest;
import com.lostquest.dto.FoundItemResponse;
import com.lostquest.dto.UpdateFoundItemRequest;
import com.lostquest.service.FoundItemService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/found-items")
public class FoundItemController {

    private final FoundItemService foundItemService;
    private final com.lostquest.service.ReturnService returnService;

    public FoundItemController(FoundItemService foundItemService, com.lostquest.service.ReturnService returnService) {
        this.foundItemService = foundItemService;
        this.returnService = returnService;
    }

    @GetMapping
    public List<FoundItemResponse> getFoundItems() {
        return foundItemService.findAll();
    }

    @PostMapping("/{id}/ownership")
    public FoundItemResponse configureOwnership(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id,
            @Valid @RequestBody com.lostquest.dto.OwnershipSetupRequest input) {
        return returnService.configureOwnership(jwt.getSubject(), id, input);
    }

    @GetMapping("/{id}")
    public FoundItemResponse getFoundItem(@PathVariable @Positive Long id) {
        return foundItemService.findById(id);
    }

    @PutMapping("/{id}")
    public FoundItemResponse updateFoundItem(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id,
            @Valid @RequestBody UpdateFoundItemRequest request) {
        return foundItemService.update(jwt.getSubject(), id, request, null);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public FoundItemResponse updateFoundItemWithImage(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id,
            @Valid @RequestPart("item") UpdateFoundItemRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        return foundItemService.update(jwt.getSubject(), id, request, image);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFoundItem(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) {
        foundItemService.delete(jwt.getSubject(), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FoundItemResponse createFoundItem(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateFoundItemRequest request) {
        return foundItemService.create(jwt.getSubject(), request);
    }

    /** Multipart variant: "item" is the same JSON as above (sent as application/json), "image" is optional. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public FoundItemResponse createFoundItemWithImage(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("item") CreateFoundItemRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        return foundItemService.create(jwt.getSubject(), request, image);
    }
}

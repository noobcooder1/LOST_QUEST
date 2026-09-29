package com.lostquest.controller;

import com.lostquest.dto.CreateFoundItemRequest;
import com.lostquest.dto.FoundItemResponse;
import com.lostquest.service.FoundItemService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/found-items")
public class FoundItemController {

    private final FoundItemService foundItemService;

    public FoundItemController(FoundItemService foundItemService) {
        this.foundItemService = foundItemService;
    }

    @GetMapping
    public List<FoundItemResponse> getFoundItems() {
        return foundItemService.findAll();
    }

    @GetMapping("/{id}")
    public FoundItemResponse getFoundItem(@PathVariable @Positive Long id) {
        return foundItemService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FoundItemResponse createFoundItem(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateFoundItemRequest request) {
        return foundItemService.create(jwt.getSubject(), request);
    }
}

package com.lostquest.controller;

import com.lostquest.dto.FoundItemResponse;
import com.lostquest.service.FoundItemService;
import jakarta.validation.constraints.Positive;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
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
}

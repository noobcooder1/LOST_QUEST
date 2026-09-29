package com.lostquest.controller;

import com.lostquest.dto.LostItemResponse;
import com.lostquest.service.LostItemService;
import jakarta.validation.constraints.Positive;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}

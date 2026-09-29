package com.lostquest.controller;

import com.lostquest.dto.HealthResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    @GetMapping
    public HealthResponse getHealth() {
        return new HealthResponse("OK", "LOST QUEST API");
    }
}

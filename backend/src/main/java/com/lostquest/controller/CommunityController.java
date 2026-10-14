package com.lostquest.controller;

import com.lostquest.dto.*;
import com.lostquest.entity.CommunityItemType;
import com.lostquest.service.CommunityService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController @Validated
@RequestMapping("/api/community")
public class CommunityController {
    private final CommunityService service;
    public CommunityController(CommunityService service) { this.service = service; }
    @GetMapping("/{type}/{itemId}/questions")
    public CommunityPage<CommunityQuestionResponse> onPost(@AuthenticationPrincipal Jwt jwt,
            @PathVariable String type, @PathVariable @Positive Long itemId, @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page) {
        return service.onPost(jwt.getSubject(), CommunityItemType.fromPath(type), itemId, page);
    }
    @PostMapping("/{type}/{itemId}/questions") @ResponseStatus(HttpStatus.CREATED)
    public CommunityQuestionResponse ask(@AuthenticationPrincipal Jwt jwt, @PathVariable String type,
            @PathVariable @Positive Long itemId, @Valid @RequestBody CommunityMessageRequest input) {
        return service.ask(jwt.getSubject(), CommunityItemType.fromPath(type), itemId, input.message());
    }
    @GetMapping("/questions")
    public CommunityPage<CommunityQuestionResponse> inbox(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page) { return service.inbox(jwt.getSubject(), page); }
    @GetMapping("/questions/{id}")
    public CommunityQuestionResponse detail(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) {
        return service.question(jwt.getSubject(), id);
    }
    @PostMapping("/questions/{id}/answer")
    public CommunityQuestionResponse answer(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id,
            @Valid @RequestBody CommunityMessageRequest input) { return service.answer(jwt.getSubject(), id, input.message()); }
    @PostMapping("/{type}/{itemId}/reports") @ResponseStatus(HttpStatus.CREATED)
    public void report(@AuthenticationPrincipal Jwt jwt, @PathVariable String type, @PathVariable @Positive Long itemId,
            @Valid @RequestBody CommunityMessageRequest input) {
        service.report(jwt.getSubject(), CommunityItemType.fromPath(type), itemId, input.message());
    }
    @GetMapping("/reports")
    public CommunityPage<CommunityReportResponse> reports(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page) { return service.reports(jwt.getSubject(), page); }
    @PostMapping("/reports/{id}/hide")
    public CommunityReportResponse hide(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) {
        return service.hide(jwt.getSubject(), id);
    }
}

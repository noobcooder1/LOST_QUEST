package com.lostquest.controller;
import com.lostquest.dto.*;
import com.lostquest.service.ReturnService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.List;
@Validated
@RestController
@RequestMapping("/api/returns")
public class ReturnController {
    private final ReturnService service;
    public ReturnController(ReturnService service) { this.service = service; }
    @GetMapping public List<ReturnResponse> list(@AuthenticationPrincipal Jwt jwt) { return service.list(jwt.getSubject()); }
    @GetMapping("/{id}") public ReturnResponse detail(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) { return service.detail(jwt.getSubject(), id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public ReturnResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateReturnRequest input) { return service.create(jwt.getSubject(), input); }
    @PostMapping("/{id}/verify-owner")
    public ReturnResponse verifyOwner(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id, @Valid @RequestBody OwnershipAnswerRequest input) { return service.verifyOwner(jwt.getSubject(), id, input.answer()); }
    @PostMapping("/{id}/approve")
    public ReturnResponse approve(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) { return service.approve(jwt.getSubject(), id); }
    @PostMapping("/{id}/renew-qr")
    public ReturnResponse renewQr(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) { return service.renewQr(jwt.getSubject(), id); }
    @PostMapping("/{id}/verify-qr")
    public ReturnResponse verifyQr(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id, @Valid @RequestBody QrVerificationRequest input) { return service.verifyQr(jwt.getSubject(), id, input.token()); }
    @PostMapping("/{id}/complete")
    public ReturnResponse complete(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) { return service.complete(jwt.getSubject(), id); }
    @PostMapping("/{id}/reject")
    public ReturnResponse reject(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) { return service.reject(jwt.getSubject(), id); }
}

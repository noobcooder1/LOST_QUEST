package com.lostquest.controller;

import com.lostquest.dto.MyItemsResponse;
import com.lostquest.service.MyItemService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Resources of the signed-in user. Kept apart from the public /api/lost-items and /api/found-items collections;
 * no user id is accepted, the JWT subject decides whose items are returned.
 */
@RestController
@RequestMapping("/api/me")
public class MyItemController {

    private final MyItemService myItemService;

    public MyItemController(MyItemService myItemService) {
        this.myItemService = myItemService;
    }

    @GetMapping("/items")
    public MyItemsResponse getMyItems(@AuthenticationPrincipal Jwt jwt) {
        return myItemService.findMine(jwt.getSubject());
    }
}

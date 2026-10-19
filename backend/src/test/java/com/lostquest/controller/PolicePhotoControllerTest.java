package com.lostquest.controller;

import com.lostquest.service.PolicePhotoService;
import com.lostquest.service.TestImages;
import com.lostquest.exception.InvalidRequestParameterException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PolicePhotoControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean PolicePhotoService photos;
    private static final String URL="https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/1.do";
    @Test void requiresLoginBeforeAnyPhotoFetch() throws Exception {
        mvc.perform(get("/api/public-items/image").param("url",URL)).andExpect(status().isUnauthorized());verifyNoInteractions(photos);
    }
    @Test void returnsCachedBinaryWithPrivateCacheAndCorsHeaders() throws Exception {
        byte[] png=TestImages.png(32,32);when(photos.get(URL)).thenReturn(new PolicePhotoService.CachedPhoto(new PolicePhotoService.Photo(png,"image/png"),true));
        mvc.perform(get("/api/public-items/image").param("url",URL).header("Origin","http://localhost:5173").with(jwt().jwt(j->j.subject("3"))))
            .andExpect(status().isOk()).andExpect(content().bytes(png)).andExpect(content().contentType("image/png"))
            .andExpect(header().string("Cache-Control","max-age=43200, private")).andExpect(header().string("X-Police-Image-Cache","HIT"))
            .andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173"));
    }
    @Test void invalidUrlsReturnAValidationError() throws Exception {
        when(photos.get("http://localhost/private")).thenThrow(new InvalidRequestParameterException("url","허용되지 않은 주소"));
        mvc.perform(get("/api/public-items/image").param("url","http://localhost/private").with(jwt())).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }
}

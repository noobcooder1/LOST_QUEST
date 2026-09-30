package com.lostquest.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.config.ImageStorageProperties;
import com.lostquest.entity.User;
import com.lostquest.entity.UserRole;
import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.UserRepository;
import com.lostquest.security.JwtTokenProvider;
import com.lostquest.service.ImageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Not @Transactional: uploads must go through real commits/rollbacks so file cleanup is exercised.
 * Rows and files are removed after each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ItemImageUploadTest {

    private static final String UUID_NAME = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private static final byte[] JPEG = image(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F'}, 64);
    private static final byte[] PNG = image(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'}, 64);
    private static final byte[] WEBP = image(new byte[] {'R', 'I', 'F', 'F', 0x24, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '}, 64);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private LostItemRepository lostItemRepository;

    @Autowired
    private FoundItemRepository foundItemRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private ImageStorageProperties storageProperties;

    @Autowired
    private ImageService imageService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private User author;
    private String token;
    private Path storageDir;

    @BeforeEach
    void setUp() {
        author = userRepository.save(new User("uploader@lostquest.test", passwordEncoder.encode("Quest1234!"), "업로더", UserRole.USER));
        token = jwtTokenProvider.issueAccessToken(author).value();
        storageDir = Paths.get(storageProperties.localDir()).toAbsolutePath().normalize();
    }

    @AfterEach
    void cleanUp() throws IOException {
        lostItemRepository.deleteAll();
        foundItemRepository.deleteAll();
        userRepository.deleteAll();
        for (Path file : storedFiles()) {
            Files.deleteIfExists(file);
        }
    }

    @Test
    @DisplayName("이미지 포함 분실물 등록(JPEG): 201, imageUrl=/api/images/{uuid}.jpg, DB·저장소에 반영")
    void createLostItemWithJpeg() throws Exception {
        JsonNode body = readJson(upload("/api/lost-items", lostItem(), image("photo.jpg", "image/jpeg", JPEG), token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(author.getId()))
                .andExpect(jsonPath("$.status").value("LOST"))
                .andExpect(jsonPath("$.imageUrl", matchesPattern("^/api/images/" + UUID_NAME + "\\.jpg$")))
                .andExpect(content().string(not(containsString("photo.jpg"))))
                .andExpect(content().string(not(containsString(storageDir.toString().replace("\\", "\\\\"))))));

        String imageUrl = body.get("imageUrl").asText();
        assertThat(lostItemRepository.findById(body.get("id").asLong()).orElseThrow().getImageUrl()).isEqualTo(imageUrl);
        Path stored = storageDir.resolve(imageUrl.substring("/api/images/".length()));
        assertThat(Files.readAllBytes(stored)).isEqualTo(JPEG);
        assertThat(storedFiles()).containsExactly(stored);
    }

    @Test
    @DisplayName("이미지 포함 습득물 등록(PNG): 201, status=STORED, imageUrl=.png")
    void createFoundItemWithPng() throws Exception {
        JsonNode body = readJson(upload("/api/found-items", foundItem(), image("found.png", "image/png", PNG), token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("STORED"))
                .andExpect(jsonPath("$.imageUrl", matchesPattern("^/api/images/" + UUID_NAME + "\\.png$"))));
        assertThat(foundItemRepository.findById(body.get("id").asLong()).orElseThrow().getImageUrl())
                .isEqualTo(body.get("imageUrl").asText());
    }

    @Test
    @DisplayName("WebP 허용, 저장 이미지는 공개 GET으로 원본 바이트·Content-Type·보안 헤더와 함께 조회")
    void webpUploadAndServe() throws Exception {
        String imageUrl = readJson(upload("/api/lost-items", lostItem(), image("x.webp", "image/webp", WEBP), token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.imageUrl", matchesPattern("^/api/images/" + UUID_NAME + "\\.webp$"))))
                .get("imageUrl").asText();

        mockMvc.perform(get(imageUrl))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/webp"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Security-Policy", "default-src 'none'; sandbox"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("immutable")))
                .andExpect(content().bytes(WEBP));
    }

    @Test
    @DisplayName("목록·상세 조회 응답에도 저장된 imageUrl 반환, 이미지 없는 항목은 null")
    void listAndDetailReturnImageUrl() throws Exception {
        JsonNode withImage = readJson(upload("/api/lost-items", lostItem(), image("a.jpg", "image/jpeg", JPEG), token));
        JsonNode withoutImage = readJson(upload("/api/lost-items", lostItem(), null, token).andExpect(status().isCreated())
                .andExpect(jsonPath("$.imageUrl").doesNotExist()));

        mockMvc.perform(get("/api/lost-items/{id}", withImage.get("id").asLong()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl").value(withImage.get("imageUrl").asText()));
        mockMvc.perform(get("/api/lost-items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].imageUrl").value(withImage.get("imageUrl").asText()))
                .andExpect(jsonPath("$[1].id").value(withoutImage.get("id").asLong()))
                .andExpect(jsonPath("$[1].imageUrl").doesNotExist());
        mockMvc.perform(get(withImage.get("imageUrl").asText()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andExpect(content().bytes(JPEG));
    }

    @Test
    @DisplayName("기존 JSON 등록(이미지 없음)은 그대로 동작하고 파일을 만들지 않음")
    void jsonCreateStillWorks() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/lost-items")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(lostItem())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.imageUrl").doesNotExist());
        assertThat(storedFiles()).isEmpty();
    }

    @Test
    @DisplayName("item JSON에 넣은 imageUrl/userId/status는 multipart에서도 무시")
    void clientCannotChooseImageUrl() throws Exception {
        Map<String, Object> item = lostItem();
        item.put("imageUrl", "/api/images/../../application-local.yml");
        item.put("userId", 999);
        item.put("status", "RETURNED");
        upload("/api/lost-items", item, null, token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.imageUrl").doesNotExist())
                .andExpect(jsonPath("$.userId").value(author.getId()))
                .andExpect(jsonPath("$.status").value("LOST"));

        upload("/api/found-items", foundItem(), image("../../evil.jpg", "image/jpeg", JPEG), token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.imageUrl", matchesPattern("^/api/images/" + UUID_NAME + "\\.jpg$")));
        assertThat(storedFiles()).hasSize(1).allSatisfy(file -> assertThat(file.getParent()).isEqualTo(storageDir));
    }

    @Test
    @DisplayName("SVG/HTML/GIF/텍스트, 형식 위장(Content-Type 불일치), 빈 파일은 400 INVALID_IMAGE, 파일·행 미생성")
    void rejectsDisallowedFiles() throws Exception {
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes(StandardCharsets.UTF_8);
        byte[] html = "<!doctype html><script>alert(1)</script>".getBytes(StandardCharsets.UTF_8);
        byte[] gif = "GIF89a\u0001\u0000\u0001\u0000".getBytes(StandardCharsets.ISO_8859_1);
        List<MockMultipartFile> invalid = List.of(
                image("x.svg", "image/svg+xml", svg),
                image("x.png", "image/png", svg),          // SVG disguised as PNG
                image("x.png", "image/png", html),         // HTML disguised as PNG
                image("x.gif", "image/gif", gif),
                image("x.txt", "text/plain", "hello".getBytes(StandardCharsets.UTF_8)),
                image("x.png", "image/png", JPEG),         // real JPEG declared as PNG
                image("x.jpg", "application/octet-stream", JPEG),
                image("x.jpg", "image/jpeg", new byte[0]));
        for (MockMultipartFile file : invalid) {
            upload("/api/lost-items", lostItem(), file, token)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400))
                    .andExpect(jsonPath("$.code").value("INVALID_IMAGE"))
                    .andExpect(jsonPath("$.path").value("/api/lost-items"));
        }
        assertThat(lostItemRepository.count()).isZero();
        assertThat(storedFiles()).isEmpty();
    }

    @Test
    @DisplayName("10MB 초과는 413 IMAGE_TOO_LARGE, 정확히 10MB는 허용")
    void enforcesTenMegabyteLimit() throws Exception {
        byte[] tooLarge = image(Arrays.copyOf(JPEG, 16), (int) ImageService.MAX_BYTES + 1);
        upload("/api/found-items", foundItem(), image("big.jpg", "image/jpeg", tooLarge), token)
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.status").value(413))
                .andExpect(jsonPath("$.code").value("IMAGE_TOO_LARGE"));
        assertThat(foundItemRepository.count()).isZero();
        assertThat(storedFiles()).isEmpty();

        byte[] exactLimit = image(Arrays.copyOf(JPEG, 16), (int) ImageService.MAX_BYTES);
        upload("/api/found-items", foundItem(), image("limit.jpg", "image/jpeg", exactLimit), token)
                .andExpect(status().isCreated());
        assertThat(storedFiles()).hasSize(1);
    }

    @Test
    @DisplayName("인증 없는 이미지 포함 등록은 401, 파일·행 미생성")
    void uploadRequiresAuthentication() throws Exception {
        upload("/api/lost-items", lostItem(), image("a.jpg", "image/jpeg", JPEG), null)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        upload("/api/found-items", foundItem(), image("a.jpg", "image/jpeg", JPEG), "not.a.jwt")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        assertThat(lostItemRepository.count()).isZero();
        assertThat(foundItemRepository.count()).isZero();
        assertThat(storedFiles()).isEmpty();
    }

    @Test
    @DisplayName("DB에 없는 사용자 토큰(401)·잘못된 물품 입력(400)은 이미지를 저장하기 전에 거부")
    void rejectsBeforeStoringFile() throws Exception {
        User ghost = new User("ghost@lostquest.test", passwordEncoder.encode("Quest1234!"), "유령", UserRole.USER);
        ReflectionTestUtils.setField(ghost, "id", 999_999L);
        upload("/api/lost-items", lostItem(), image("a.jpg", "image/jpeg", JPEG), jwtTokenProvider.issueAccessToken(ghost).value())
                .andExpect(status().isUnauthorized());

        Map<String, Object> invalid = lostItem();
        invalid.put("lostDate", "2999-01-01");
        invalid.put("region", "어딘가");
        upload("/api/lost-items", invalid, image("a.jpg", "image/jpeg", JPEG), token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        assertThat(lostItemRepository.count()).isZero();
        assertThat(storedFiles()).isEmpty();
    }

    @Test
    @DisplayName("item 파트 누락 multipart는 400")
    void missingItemPartIsBadRequest() throws Exception {
        mockMvc.perform(multipart("/api/lost-items").file(image("a.jpg", "image/jpeg", JPEG))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        assertThat(storedFiles()).isEmpty();
    }

    @Test
    @DisplayName("저장 후 트랜잭션이 커밋되지 않으면 파일 삭제, 커밋되면 유지")
    void deletesFileWhenTransactionRollsBack() throws IOException {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        String rolledBack = tx.execute(status -> {
            String url = imageService.storeForNewItem(image("a.jpg", "image/jpeg", JPEG));
            assertThat(storedFiles()).hasSize(1);   // written during the transaction
            status.setRollbackOnly();               // e.g. the INSERT failed
            return url;
        });
        assertThat(rolledBack).startsWith("/api/images/");
        assertThat(storedFiles()).isEmpty();

        String committed = tx.execute(status -> imageService.storeForNewItem(image("b.png", "image/png", PNG)));
        assertThat(storedFiles()).containsExactly(storageDir.resolve(committed.substring("/api/images/".length())));
    }

    @Test
    @DisplayName("이미지 조회: 없는 이미지 404, 경로 조작·임의 이름은 404 (저장소 밖 파일 접근 불가)")
    void imageLookupNotFoundAndTraversal() throws Exception {
        mockMvc.perform(get("/api/images/{name}", "00000000-0000-0000-0000-000000000000.jpg"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        for (String name : List.of("application.yml", "..%2F..%2Fpom.xml", "..\\..\\pom.xml", "abc.svg",
                "00000000-0000-0000-0000-000000000000.svg", "00000000-0000-0000-0000-000000000000.JPG")) {
            mockMvc.perform(get("/api/images/" + name))
                    .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(400, 404));
        }
        mockMvc.perform(get("/api/images/../application.yml"))
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(400, 403, 404));
    }

    private ResultActions upload(String path, Map<String, Object> item, MockMultipartFile image, String bearer) throws Exception {
        MockMultipartHttpServletRequestBuilder request = multipart(path).file(new MockMultipartFile("item", "", "application/json",
                objectMapper.writeValueAsBytes(item)));
        if (image != null) {
            request.file(image);
        }
        if (bearer != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        }
        return mockMvc.perform(request);
    }

    private static MockMultipartFile image(String filename, String contentType, byte[] content) {
        return new MockMultipartFile("image", filename, contentType, content);
    }

    /** Signature bytes followed by filler up to {@code size}. */
    private static byte[] image(byte[] signature, int size) {
        byte[] bytes = Arrays.copyOf(signature, Math.max(size, signature.length));
        for (int i = signature.length; i < bytes.length; i++) {
            bytes[i] = (byte) (i % 251);
        }
        return bytes;
    }

    private List<Path> storedFiles() {
        if (!Files.isDirectory(storageDir)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(storageDir)) {
            return files.toList();
        } catch (IOException ex) {
            throw new java.io.UncheckedIOException(ex);
        }
    }

    private Map<String, Object> lostItem() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "검은색 가죽 지갑");
        body.put("category", "지갑");
        body.put("color", "검정");
        body.put("description", "검은색 반지갑입니다. 겉면에 작은 스크래치가 있어요.");
        body.put("lostDate", "2026-09-16");
        body.put("region", "서울");
        body.put("location", "서울 성동구 서울숲역 3번 출구");
        return body;
    }

    private Map<String, Object> foundItem() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "화이트 무선 이어폰");
        body.put("category", "전자기기");
        body.put("color", "흰색");
        body.put("description", "흰색 충전 케이스와 이어폰 한 쌍을 보관하고 있어요.");
        body.put("foundDate", "2026-09-21");
        body.put("region", "경기");
        body.put("location", "경기 수원시 광교중앙역 버스 정류장");
        return body;
    }

    private JsonNode readJson(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }
}

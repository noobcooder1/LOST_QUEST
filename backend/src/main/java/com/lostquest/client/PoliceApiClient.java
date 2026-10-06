package com.lostquest.client;

import com.lostquest.config.PoliceApiProperties;
import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.ExternalApiException.Kind;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Calls the 경찰청 OpenAPI (apis.data.go.kr). Each operation uses only its own service's key, so a missing
 * or rejected key for one service (lost, found, common codes) never affects the others. Request URLs contain the key and
 * are therefore never logged or put into exception messages.
 */
@Component
public class PoliceApiClient {

    /** Upstream responses are small XML documents; anything larger is treated as invalid. */
    static final int MAX_BODY_BYTES = 5 * 1024 * 1024;

    public enum Service {
        LOST("LostGoodsInfoInqireService"),
        FOUND("LosfundInfoInqireService"),
        CODE("CmmnCdService");

        final String path;

        Service(String path) {
            this.path = path;
        }
    }

    /** Operation names as published on data.go.kr (15000799, 15058696, 15000651) and verified with real calls. */
    public enum Operation {
        LOST_LIST(Service.LOST, "getLostGoodsInfoAccToClAreaPd"),
        LOST_SEARCH(Service.LOST, "getLostGoodsInfoAccTpNmCstdyPlace"),
        LOST_DETAIL(Service.LOST, "getLostGoodsDetailInfo"),
        FOUND_LIST(Service.FOUND, "getLosfundInfoAccToClAreaPd"),
        FOUND_SEARCH(Service.FOUND, "getLosfundInfoAccTpNmCstdyPlace"),
        FOUND_DETAIL(Service.FOUND, "getLosfundDetailInfo"),
        /** Common codes (data.go.kr 15000651): GRP_NM filters a group, e.g. "지역구분", "색상코드". */
        CODE_COMMON(Service.CODE, "getCmmnCd"),
        /** Item classes: no parameter = top level, PRDT_CL_CD_01 = children of that class. */
        CODE_ITEM_CLASS(Service.CODE, "getThngClCd");

        final Service service;
        final String name;

        Operation(Service service, String name) {
            this.service = service;
            this.name = name;
        }
    }

    private final PoliceApiProperties properties;
    private final HttpClient httpClient;

    public PoliceApiClient(PoliceApiProperties properties) {
        this.properties = properties;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(properties.connectTimeout())
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public boolean isConfigured(Service service) {
        return keyFor(service).configured();
    }

    public PoliceXmlResponse call(Operation operation, Map<String, String> params) {
        String context = operation.name();
        PoliceApiProperties.Service key = keyFor(operation.service);
        if (!key.configured()) {
            throw new ExternalApiException(Kind.NOT_CONFIGURED, context + ": service key missing");
        }
        HttpRequest request = HttpRequest.newBuilder(buildUri(operation, key.serviceKey(), params))
                .timeout(properties.readTimeout())
                .header("Accept", "application/xml")
                .GET()
                .build();

        HttpResponse<InputStream> response;
        byte[] body;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = response.body()) {
                body = in.readNBytes(MAX_BODY_BYTES + 1);
            }
        } catch (HttpConnectTimeoutException ex) {
            throw new ExternalApiException(Kind.TIMEOUT, context + ": connect timeout");
        } catch (HttpTimeoutException ex) {
            throw new ExternalApiException(Kind.TIMEOUT, context + ": read timeout");
        } catch (IOException ex) {
            throw new ExternalApiException(Kind.UNAVAILABLE, context + ": " + ex.getClass().getSimpleName());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ExternalApiException(Kind.UNAVAILABLE, context + ": interrupted");
        }
        if (body.length > MAX_BODY_BYTES) {
            throw new ExternalApiException(Kind.INVALID_RESPONSE, context + ": body too large");
        }

        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return PoliceXmlParser.parse(body, context);
        }
        // Gateway errors (e.g. 401 SERVICE_KEY_IS_NULL, 403 not registered) carry an XML explanation.
        try {
            PoliceXmlParser.parse(body, context + " HTTP " + status);
        } catch (ExternalApiException ex) {
            if (ex.getKind() != Kind.INVALID_RESPONSE) {
                throw ex;
            }
        }
        if (status == 429) {
            throw new ExternalApiException(Kind.RATE_LIMITED, context + ": HTTP 429");
        }
        if (status == 401 || status == 403) {
            throw new ExternalApiException(Kind.AUTH_FAILED, context + ": HTTP " + status);
        }
        throw new ExternalApiException(Kind.UPSTREAM_ERROR, context + ": HTTP " + status);
    }

    private PoliceApiProperties.Service keyFor(Service service) {
        return switch (service) {
            case LOST -> properties.lost();
            case FOUND -> properties.found();
            case CODE -> properties.code();
        };
    }

    /**
     * Every value is percent-encoded exactly once. The portal also hands out an already-encoded
     * ("Encoding") key; such a key is decoded first so it is never double-encoded.
     */
    private URI buildUri(Operation operation, String serviceKey, Map<String, String> params) {
        String rawKey = serviceKey.strip();
        if (rawKey.contains("%")) {
            rawKey = URLDecoder.decode(rawKey, StandardCharsets.UTF_8);
        }
        StringJoiner query = new StringJoiner("&");
        query.add("serviceKey=" + encode(rawKey));
        params.forEach((name, value) -> {
            if (value != null && !value.isBlank()) {
                query.add(encode(name) + "=" + encode(value));
            }
        });
        String base = properties.baseUrl().replaceAll("/+$", "");
        return URI.create(base + "/" + operation.service.path + "/" + operation.name + "?" + query);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}

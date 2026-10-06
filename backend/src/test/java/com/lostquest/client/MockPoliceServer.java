package com.lostquest.client;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Local stand-in for apis.data.go.kr/1320000 used by tests, so no test depends on the real 경찰청 server.
 * Responses are registered per operation name (last path segment); raw query strings are recorded.
 */
public final class MockPoliceServer implements AutoCloseable {

    public record Reply(int status, byte[] body, long delayMillis) {
    }

    private final HttpServer server;
    private final Map<String, Reply> replies = new ConcurrentHashMap<>();
    /** Conditional replies: operation -> (decoded query fragment -> reply), checked before {@link #replies}. */
    private final Map<String, Map<String, Reply>> conditional = new ConcurrentHashMap<>();
    private final List<String> requests = new CopyOnWriteArrayList<>();

    public MockPoliceServer() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getRawPath();
            String rawQuery = exchange.getRequestURI().getRawQuery();
            requests.add(path + "?" + rawQuery);
            String operation = path.substring(path.lastIndexOf('/') + 1);
            String decoded = java.net.URLDecoder.decode(rawQuery == null ? "" : rawQuery, java.nio.charset.StandardCharsets.UTF_8);
            Reply reply = conditional.getOrDefault(operation, Map.of()).entrySet().stream()
                    .filter(entry -> decoded.contains(entry.getKey()))
                    .map(Map.Entry::getValue)
                    .findFirst()
                    .orElse(replies.getOrDefault(operation, new Reply(404, "<html>not found</html>".getBytes(), 0)));
            try {
                if (reply.delayMillis() > 0) {
                    Thread.sleep(reply.delayMillis());
                }
                exchange.getResponseHeaders().add("Content-Type", "application/xml");
                exchange.sendResponseHeaders(reply.status(), reply.body().length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(reply.body());
                }
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            } catch (IOException ignored) {
                // client gave up (timeout tests)
            } finally {
                exchange.close();
            }
        });
        // Concurrent handlers: a deliberately slow reply (timeout tests) must not block later requests.
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool(runnable -> {
            Thread thread = new Thread(runnable, "mock-police-server");
            thread.setDaemon(true);
            return thread;
        }));
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/1320000";
    }

    public void reply(String operation, int status, byte[] body) {
        replies.put(operation, new Reply(status, body, 0));
    }

    public void replyFixture(String operation, String fixture) {
        reply(operation, 200, fixture(fixture));
    }

    /** Reply with a fixture only when the decoded query contains {@code queryFragment}, e.g. "GRP_NM=지역구분". */
    public void replyFixtureWhen(String operation, String queryFragment, String fixture) {
        conditional.computeIfAbsent(operation, key -> new java.util.concurrent.ConcurrentHashMap<>())
                .put(queryFragment, new Reply(200, fixture(fixture), 0));
    }

    /** Common-code fixtures trimmed from real CmmnCdService responses (regions, colors, item classes). */
    public void replyCommonCodes() {
        replyFixtureWhen("getCmmnCd", "GRP_NM=지역구분", "code-regions.xml");
        replyFixtureWhen("getCmmnCd", "GRP_NM=색상코드", "code-colors.xml");
        replyFixtureWhen("getThngClCd", "PRDT_CL_CD_01=PRH000", "code-classes-PRH000.xml");
        replyFixtureWhen("getThngClCd", "PRDT_CL_CD_01=PRA000", "code-classes-PRA000.xml");
        replyFixture("getThngClCd", "code-classes.xml");
    }

    public void replySlow(String operation, String fixture, long delayMillis) {
        replies.put(operation, new Reply(200, fixture(fixture), delayMillis));
    }

    public List<String> requests() {
        return requests;
    }

    public void reset() {
        replies.clear();
        conditional.clear();
        requests.clear();
    }

    public static byte[] fixture(String name) {
        try (InputStream in = MockPoliceServer.class.getResourceAsStream("/police/" + name)) {
            if (in == null) {
                throw new IllegalArgumentException("Missing fixture " + name);
            }
            return in.readAllBytes();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}

import java.net.URI;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** Run from backend/, against an explicitly provisioned LOCAL TEST database only. */
class CommunityMySqlCheck {
    public static void main(String[] args) throws Exception {
        String raw = System.getenv("MYSQL_TEST_URL");
        String user = System.getenv("MYSQL_TEST_USERNAME");
        String password = System.getenv("MYSQL_TEST_PASSWORD");
        if (!"isolated-test-database".equals(System.getenv("MYSQL_TEST_CONFIRM")) || raw == null ||
                !raw.startsWith("jdbc:mysql://") || user == null || user.isBlank() || password == null ||
                !Files.exists(Path.of("mvnw.cmd"))) throw new IllegalStateException("Explicit test settings and backend working directory required");
        URI uri = URI.create(raw.substring(5));
        String schema = uri.getPath() == null ? "" : uri.getPath().substring(1);
        if (!Set.of("localhost", "127.0.0.1").contains(uri.getHost()) || uri.getUserInfo() != null ||
                uri.getQuery() != null || uri.getFragment() != null ||
                !schema.matches("lost_quest_test|lq_test_[a-zA-Z0-9_]+"))
            throw new IllegalStateException("Only a local dedicated test schema is allowed; URL credentials/options are refused");
        String prefix = "lq_test_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12) + "_";
        String url = raw + "?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8&allowPublicKeyRetrieval=true&sslMode=DISABLED";
        int result = 1;
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            try (ResultSet tables = connection.getMetaData().getTables(schema, null, "%", new String[]{"TABLE"})) {
                while (tables.next()) {
                    String name = tables.getString("TABLE_NAME");
                    if (!name.matches("lq_test_[a-f0-9]{12}_[a-z0-9_]+") || name.startsWith(prefix))
                        throw new IllegalStateException("Test database contains non-isolated tables or a prefix collision");
                }
            }
            System.out.println("Dedicated local test database confirmed; owned table prefix: " + prefix);
            try {
                ProcessBuilder process = new ProcessBuilder("cmd.exe", "/c", "mvnw.cmd",
                        "-Dtest=CommunityControllerTest,CommunityWriteLimiterTest,ItemControllerTest,ItemManagementControllerTest,ItemImageUploadTest,ReturnControllerTest", "test");
                Map<String, String> env = process.environment();
                env.keySet().removeIf(key -> key.startsWith("SPRING_") || key.startsWith("MYSQL_TEST_") ||
                        Set.of("JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS", "MAVEN_OPTS", "MAVEN_ARGS").contains(key));
                env.put("SPRING_DATASOURCE_URL", url); env.put("SPRING_DATASOURCE_USERNAME", user); env.put("SPRING_DATASOURCE_PASSWORD", password);
                env.put("SPRING_DATASOURCE_DRIVER_CLASS_NAME", "com.mysql.cj.jdbc.Driver");
                env.put("SPRING_JPA_HIBERNATE_DDL_AUTO", "create-drop"); env.put("SPRING_CONFIG_IMPORT", "");
                env.put("SPRING_JPA_PROPERTIES_HIBERNATE_DIALECT", "org.hibernate.dialect.MySQLDialect");
                env.put("SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY", "com.lostquest.IsolatedMySqlNamingStrategy");
                env.put("COMMUNITY_TEST_TABLE_PREFIX", prefix);
                Path log = Path.of("../.local/community-mysql-reproduction.log"); Files.createDirectories(log.getParent());
                process.redirectErrorStream(true).redirectOutput(log.toFile());
                result = process.start().waitFor();
            } finally {
                List<String> owned = new ArrayList<>();
                try (ResultSet tables = connection.getMetaData().getTables(schema, null, "%", new String[]{"TABLE"})) {
                    while (tables.next()) {
                        String name = tables.getString("TABLE_NAME");
                        if (name.startsWith(prefix)) {
                            if (!name.matches("lq_test_[a-f0-9]{12}_[a-z0-9_]+")) throw new IllegalStateException("Unsafe cleanup table name");
                            owned.add(name);
                        }
                    }
                }
                try (Statement statement = connection.createStatement()) {
                    statement.execute("SET FOREIGN_KEY_CHECKS=0");
                    try { for (String table : owned) statement.execute("DROP TABLE `" + table + "`"); }
                    finally { statement.execute("SET FOREIGN_KEY_CHECKS=1"); }
                }
                System.out.println("Owned-prefix cleanup completed; test exit: " + result);
            }
        }
        System.exit(result);
    }
}

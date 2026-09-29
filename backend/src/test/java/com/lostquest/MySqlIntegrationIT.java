package com.lostquest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.sql.Connection;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

public class MySqlIntegrationIT {

    @Test
    @DisplayName("MySQL 테스트 DB (127.0.0.1:3306) 포트 및 연결 상태 검증")
    void testMySqlConnection() {
        String host = System.getenv().getOrDefault("DB_HOST", "127.0.0.1");
        int port = Integer.parseInt(System.getenv().getOrDefault("DB_PORT", "3306"));
        String dbName = System.getenv().getOrDefault("DB_NAME", "lost_quest");
        String username = System.getenv("DB_USERNAME");
        String password = System.getenv("DB_PASSWORD");

        // 1. 소켓 레벨 포트(3306) 청취 여부 확인
        boolean portListening = false;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 2000);
            portListening = true;
        } catch (Exception e) {
            portListening = false;
        }

        if (!portListening) {
            fail("MySQL 서버(" + host + ":" + port + ")가 실행 중이지 않아 연결에 실패했습니다. (로컬 MySQL 서비스 또는 Docker 컨테이너 확인 필요)");
        }

        // 2. JDBC 드라이버 연결 테스트
        String url = String.format("jdbc:mysql://%s:%d/%s?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8", host, port, dbName);
        try (Connection conn = DriverManager.getConnection(url, username, password)) {
            assertThat(conn.isValid(2)).isTrue();
        } catch (Exception e) {
            fail("MySQL 포트는 열려 있으나 DB 연결에 실패했습니다: " + e.getMessage());
        }
    }
}

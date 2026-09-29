package com.lostquest;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

// Users authenticate with DB accounts and JWT Bearer tokens; never create a default in-memory login account.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class LostQuestApplication {
    public static void main(String[] args) {
        SpringApplication.run(LostQuestApplication.class, args);
    }
}

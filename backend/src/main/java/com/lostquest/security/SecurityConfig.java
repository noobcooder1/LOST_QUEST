package com.lostquest.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lostquest.exception.ApiError;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper mapper,
            JwtAuthenticationConverter jwtAuthenticationConverter) throws Exception {
        AuthenticationEntryPoint authenticationEntryPoint = (request, response, ex) -> writeError(mapper, response,
                ex instanceof OAuth2AuthenticationException
                        ? ApiError.of(401, "INVALID_TOKEN", "인증 토큰이 유효하지 않거나 만료되었습니다.", request.getRequestURI())
                        : ApiError.of(401, "UNAUTHORIZED", "인증이 필요한 요청입니다.", request.getRequestURI()));
        AccessDeniedHandler accessDeniedHandler = (request, response, ex) -> writeError(mapper, response,
                ApiError.of(403, "FORBIDDEN", "허용되지 않은 요청입니다.", request.getRequestURI()));
        return http
                .cors(Customizer.withDefaults())
                // Credentials travel only in the Authorization: Bearer header, which browsers never attach
                // automatically (no session/auth cookies exist), so cross-site request forgery cannot ride on them.
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/health", "/api/lost-items", "/api/found-items",
                                "/api/lost-items/{id}", "/api/found-items/{id}", "/api/images/{filename}").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/public-items/lost", "/api/public-items/found", "/api/public-items/filters",
                                "/api/public-items/lost/{atcId}", "/api/public-items/found/{atcId}/{fdSn}").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/signup", "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/me", "/api/lost-items/{id}/matches").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/lost-items", "/api/found-items").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    private void writeError(ObjectMapper mapper, HttpServletResponse response, ApiError error) throws IOException {
        response.setStatus(error.status());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(response.getWriter(), error);
    }
}

package org.conductoross.conductor;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@ConditionalOnProperty(
        value = "conductor.enable.ui.serving",
        havingValue = "true",
        matchIfMissing = true)
public class SpaInterceptor implements HandlerInterceptor {

    public SpaInterceptor() {
        log.info("Serving UI on /");
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String path = request.getRequestURI();
        log.debug("Service SPA page {}", path);

        // Skip backend APIs, OpenAPI docs, health endpoints, and static resources.
        if (path.startsWith("/api/")
                || path.startsWith("/api-docs")
                || path.startsWith("/v3/api-docs")
                || path.startsWith("/swagger-ui")
                || path.startsWith("/actuator")
                || path.startsWith("/health")
                || path.equals("/error")
                || path.contains(".")) {
            return true;
        }

        // Forward to index.html
        request.getRequestDispatcher("/index.html").forward(request, response);
        return false;
    }
}

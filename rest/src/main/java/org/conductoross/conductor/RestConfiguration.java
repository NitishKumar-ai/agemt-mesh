package org.conductoross.conductor;

import java.util.Optional;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.extern.slf4j.Slf4j;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.http.MediaType.APPLICATION_OCTET_STREAM;
import static org.springframework.http.MediaType.TEXT_PLAIN;

@Configuration
@Slf4j
public class RestConfiguration implements WebMvcConfigurer {

    private final SpaInterceptor spaInterceptor;

    public RestConfiguration(Optional<SpaInterceptor> spaInterceptor) {
        this.spaInterceptor = spaInterceptor.orElse(null);
        log.info("spaInterceptor: {}", spaInterceptor);
    }

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer
                .favorParameter(false)
                .favorPathExtension(false)
                .ignoreAcceptHeader(true)
                .defaultContentType(APPLICATION_JSON, TEXT_PLAIN, APPLICATION_OCTET_STREAM);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (spaInterceptor != null) {
            registry.addInterceptor(spaInterceptor)
                    .excludePathPatterns("/api/**")
                    .excludePathPatterns("/actuator")
                    .excludePathPatterns("/actuator/**")
                    .excludePathPatterns("/health")
                    .excludePathPatterns("/health/**")
                    .excludePathPatterns("/api-docs")
                    .excludePathPatterns("/api-docs/**")
                    .excludePathPatterns("/v3/api-docs")
                    .excludePathPatterns("/v3/api-docs/**")
                    .excludePathPatterns("/swagger-ui")
                    .excludePathPatterns("/swagger-ui/**")
                    .order(Ordered.HIGHEST_PRECEDENCE);
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (spaInterceptor != null) {
            log.info("Serving static resources");
            registry.addResourceHandler("/static/ui/**")
                    .addResourceLocations("classpath:/static/ui/");
        }
    }
}

package org.conductoross.conductor.local.config;

import org.conductoross.conductor.core.storage.FileStorage;
import org.conductoross.conductor.local.storage.LocalFileStorage;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(LocalFileStorageProperties.class)
@ConditionalOnProperty(name = "conductor.file-storage.enabled", havingValue = "true")
public class LocalFileStorageConfiguration {

    @Bean
    @ConditionalOnProperty(name = "conductor.file-storage.type", havingValue = "local")
    public FileStorage localFileStorage(LocalFileStorageProperties properties) {
        return new LocalFileStorage(properties);
    }
}

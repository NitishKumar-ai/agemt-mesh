package com.netflix.conductor.azureblob.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.azureblob.storage.AzureBlobPayloadStorage;
import com.netflix.conductor.common.utils.ExternalPayloadStorage;
import com.netflix.conductor.core.utils.IDGenerator;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AzureBlobProperties.class)
@ConditionalOnProperty(name = "conductor.external-payload-storage.type", havingValue = "azureblob")
public class AzureBlobConfiguration {

    @Bean
    public ExternalPayloadStorage azureBlobExternalPayloadStorage(
            IDGenerator idGenerator, AzureBlobProperties properties) {
        return new AzureBlobPayloadStorage(idGenerator, properties);
    }
}

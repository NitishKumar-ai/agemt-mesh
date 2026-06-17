package com.netflix.conductor.common.utils;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.netflix.conductor.common.config.ObjectMapperProvider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;

@Component
public class SummaryUtil {

    private static final Logger logger = LoggerFactory.getLogger(SummaryUtil.class);
    private static final ObjectMapper objectMapper = new ObjectMapperProvider().getObjectMapper();

    private static boolean isSummaryInputOutputJsonSerializationEnabled;

    @Value("${conductor.app.summary-input-output-json-serialization.enabled:false}")
    private boolean isJsonSerializationEnabled;

    @PostConstruct
    public void init() {
        isSummaryInputOutputJsonSerializationEnabled = isJsonSerializationEnabled;
    }

    /**
     * Serializes the Workflow or Task's Input/Output object by Java's toString (default), or by a
     * Json ObjectMapper (@see Configuration.isSummaryInputOutputJsonSerializationEnabled)
     *
     * @param object the Input or Output Object to serialize
     * @return the serialized string of the Input or Output object
     */
    public static String serializeInputOutput(Map<String, Object> object) {
        if (!isSummaryInputOutputJsonSerializationEnabled) {
            return object.toString();
        }

        try {
            return objectMapper.writeValueAsString(object);
        } catch (JsonProcessingException e) {
            logger.error(
                    "The provided value ({}) could not be serialized as Json",
                    object.toString(),
                    e);
            throw new RuntimeException(e);
        }
    }
}

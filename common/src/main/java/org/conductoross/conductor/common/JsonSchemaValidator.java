package org.conductoross.conductor.common;

import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersionDetector;
import com.networknt.schema.ValidationMessage;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;

@Component
@RequiredArgsConstructor
public class JsonSchemaValidator {

    private final ObjectMapper mapper;

    @SneakyThrows
    public JsonSchema getJsonSchema(String schemaContent) {
        JsonNode jsonNode = mapper.readTree(schemaContent);
        JsonSchemaFactory factory =
                JsonSchemaFactory.getInstance(SpecVersionDetector.detect(jsonNode));
        return factory.getSchema(jsonNode);
    }

    public Set<ValidationMessage> validate(String schemaContent, Map<String, Object> body) {
        JsonSchema schema = getJsonSchema(schemaContent);
        schema.initializeValidators();
        JsonNode node = getJsonNode(body);
        return schema.validate(node);
    }

    @SneakyThrows
    private JsonNode getJsonNode(Map<String, Object> body) {
        return mapper.valueToTree(body);
    }
}

package com.netflix.conductor.model

import com.netflix.conductor.common.config.ObjectMapperProvider

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import spock.lang.Specification
import spock.lang.Subject

class TaskModelSpec extends Specification {

    @Subject
    TaskModel taskModel

    private static final ObjectMapper objectMapper = new ObjectMapperProvider().getObjectMapper()

    def setup() {
        taskModel = new TaskModel()
    }

    def "check inputData serialization"() {
        given:
        String path = "task/input/${UUID.randomUUID()}.json"
        taskModel.addInput(['key1': 'value1', 'key2': 'value2'])
        taskModel.externalizeInput(path)

        when:
        def json = objectMapper.writeValueAsString(taskModel)
        println(json)

        then:
        json != null
        JsonNode node = objectMapper.readTree(json)
        node.path("inputData").isEmpty()
        node.path("externalInputPayloadStoragePath").isTextual()
    }

    def "check outputData serialization"() {
        given:
        String path = "task/output/${UUID.randomUUID()}.json"
        taskModel.addOutput(['key1': 'value1', 'key2': 'value2'])
        taskModel.externalizeOutput(path)

        when:
        def json = objectMapper.writeValueAsString(taskModel)
        println(json)

        then:
        json != null
        JsonNode node = objectMapper.readTree(json)
        node.path("outputData").isEmpty()
        node.path("externalOutputPayloadStoragePath").isTextual()
    }
}

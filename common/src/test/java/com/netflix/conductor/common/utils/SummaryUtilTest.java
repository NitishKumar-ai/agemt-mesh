package com.netflix.conductor.common.utils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit4.SpringRunner;

import com.netflix.conductor.common.config.TestObjectMapperConfiguration;

import com.fasterxml.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

@ContextConfiguration(
        classes = {
            TestObjectMapperConfiguration.class,
            SummaryUtilTest.SummaryUtilTestConfiguration.class
        })
@RunWith(SpringRunner.class)
public class SummaryUtilTest {

    @Configuration
    static class SummaryUtilTestConfiguration {

        @Bean
        public SummaryUtil summaryUtil() {
            return new SummaryUtil();
        }
    }

    @Autowired private ObjectMapper objectMapper;

    private Map<String, Object> testObject;

    @Before
    public void init() {
        Map<String, Object> child = new HashMap<>();
        child.put("testStr", "childTestStr");

        Map<String, Object> obj = new HashMap<>();
        obj.put("testStr", "stringValue");
        obj.put("testArray", new ArrayList<>(Arrays.asList(1, 2, 3)));
        obj.put("testObj", child);
        obj.put("testNull", null);

        testObject = obj;
    }

    @Test
    public void testSerializeInputOutput_defaultToString() throws Exception {
        new ApplicationContextRunner()
                .withPropertyValues(
                        "conductor.app.summary-input-output-json-serialization.enabled:false")
                .withUserConfiguration(SummaryUtilTestConfiguration.class)
                .run(
                        context -> {
                            String serialized = SummaryUtil.serializeInputOutput(this.testObject);

                            assertEquals(
                                    this.testObject.toString(),
                                    serialized,
                                    "The Java.toString() Serialization should match the serialized Test Object");
                        });
    }

    @Test
    public void testSerializeInputOutput_jsonSerializationEnabled() throws Exception {
        new ApplicationContextRunner()
                .withPropertyValues(
                        "conductor.app.summary-input-output-json-serialization.enabled:true")
                .withUserConfiguration(SummaryUtilTestConfiguration.class)
                .run(
                        context -> {
                            String serialized = SummaryUtil.serializeInputOutput(testObject);

                            assertEquals(
                                    objectMapper.writeValueAsString(testObject),
                                    serialized,
                                    "The ObjectMapper Json Serialization should match the serialized Test Object");
                        });
    }
}

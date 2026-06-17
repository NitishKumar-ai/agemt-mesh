package org.conductoross.conductor.ai;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import org.conductoross.conductor.ai.models.LLMWorkerInput;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Getter
@Component
@Slf4j
public class AIModelProvider {

    private final Map<String, AIModel> providerToLLM = new HashMap<>();

    private String payloadStoreLocation;

    public AIModelProvider(
            List<ModelConfiguration<? extends AIModel>> modelConfigurations, Environment env) {
        String defaultPayloadStoreLocation = System.getProperty("user.home") + "/worker-payload/";

        for (ModelConfiguration<? extends AIModel> modelConfiguration : modelConfigurations) {
            try {
                AIModel llm = modelConfiguration.get();
                payloadStoreLocation =
                        env.getProperty(
                                "conductor.file-storage.parentDir", defaultPayloadStoreLocation);
                boolean result = new File(payloadStoreLocation).mkdirs();
                log.info(
                        "Created directory {} ? {} for storing worker payload data",
                        payloadStoreLocation,
                        result);
                providerToLLM.put(llm.getModelProvider(), llm);
                for (String alias : llm.getProviderAliases()) {
                    providerToLLM.put(alias, llm);
                }
            } catch (Throwable t) {
                log.error("cannot init {} model, reason: {}", modelConfiguration, t.getMessage());
            }
        }
    }

    public AIModel getModel(LLMWorkerInput input) {
        String name = input.getLlmProvider();
        if (name == null) {
            throw new RuntimeException("llmProvider not specified: " + name);
        }
        AIModel model = providerToLLM.get(name);
        if (model == null) {
            throw new RuntimeException("no configuration found for: " + name);
        }
        return model;
    }

    public Consumer<TokenUsageLog> getTokenUsageLogger() {
        return usageLog -> log.info("{}", usageLog);
    }
}

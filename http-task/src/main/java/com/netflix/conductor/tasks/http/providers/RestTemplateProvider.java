package com.netflix.conductor.tasks.http.providers;

import org.springframework.lang.NonNull;
import org.springframework.web.client.RestTemplate;

import com.netflix.conductor.tasks.http.HttpTask;

@FunctionalInterface
public interface RestTemplateProvider {

    RestTemplate getRestTemplate(@NonNull HttpTask.Input input);
}

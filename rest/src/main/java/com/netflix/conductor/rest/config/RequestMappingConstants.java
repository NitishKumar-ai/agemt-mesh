package com.netflix.conductor.rest.config;

public interface RequestMappingConstants {

    String API_PREFIX = "/api/";

    String ADMIN = API_PREFIX + "admin";
    String EVENT = API_PREFIX + "event";
    String METADATA = API_PREFIX + "metadata";
    String QUEUE = API_PREFIX + "queue";
    String TASKS = API_PREFIX + "tasks";
    String WORKFLOW_BULK = API_PREFIX + "workflow/bulk";
    String WORKFLOW = API_PREFIX + "workflow";
    String VERSION = API_PREFIX + "version";
    String FILES = API_PREFIX + "files";
}

package com.netflix.conductor.common.metadata.workflow;

import com.netflix.conductor.annotations.protogen.ProtoEnum;
import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

/** Rate limit configuration for workflows */
@ProtoMessage
public class RateLimitConfig {

    /** Rate limit policy defining how to handle requests exceeding the limit */
    @ProtoEnum
    public enum RateLimitPolicy {
        /** Queue the request until capacity is available */
        QUEUE,
        /** Reject the request immediately */
        REJECT
    }

    /**
     * Key that defines the rate limit. Rate limit key is a combination of workflow payload such as
     * name, or correlationId etc.
     */
    @ProtoField(id = 1)
    private String rateLimitKey;

    /** Number of concurrently running workflows that are allowed per key */
    @ProtoField(id = 2)
    private int concurrentExecLimit;

    /** Policy to apply when rate limit is exceeded */
    @ProtoField(id = 3)
    private RateLimitPolicy policy = RateLimitPolicy.QUEUE;

    public String getRateLimitKey() {
        return rateLimitKey;
    }

    public void setRateLimitKey(String rateLimitKey) {
        this.rateLimitKey = rateLimitKey;
    }

    public int getConcurrentExecLimit() {
        return concurrentExecLimit;
    }

    public void setConcurrentExecLimit(int concurrentExecLimit) {
        this.concurrentExecLimit = concurrentExecLimit;
    }

    public RateLimitPolicy getPolicy() {
        return policy;
    }

    public void setPolicy(RateLimitPolicy policy) {
        this.policy = policy;
    }
}

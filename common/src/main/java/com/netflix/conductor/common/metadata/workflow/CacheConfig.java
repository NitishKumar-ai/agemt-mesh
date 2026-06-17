package com.netflix.conductor.common.metadata.workflow;

import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

@ProtoMessage
public class CacheConfig {

    @ProtoField(id = 1)
    private String key;

    @ProtoField(id = 2)
    private int ttlInSecond;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public int getTtlInSecond() {
        return ttlInSecond;
    }

    public void setTtlInSecond(int ttlInSecond) {
        this.ttlInSecond = ttlInSecond;
    }
}

package com.netflix.conductor.common.metadata.tasks;

import java.util.Objects;

import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

@ProtoMessage
public class PollData {

    @ProtoField(id = 1)
    private String queueName;

    @ProtoField(id = 2)
    private String domain;

    @ProtoField(id = 3)
    private String workerId;

    @ProtoField(id = 4)
    private long lastPollTime;

    public PollData() {
        super();
    }

    public PollData(String queueName, String domain, String workerId, long lastPollTime) {
        super();
        this.queueName = queueName;
        this.domain = domain;
        this.workerId = workerId;
        this.lastPollTime = lastPollTime;
    }

    public String getQueueName() {
        return queueName;
    }

    public void setQueueName(String queueName) {
        this.queueName = queueName;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getWorkerId() {
        return workerId;
    }

    public void setWorkerId(String workerId) {
        this.workerId = workerId;
    }

    public long getLastPollTime() {
        return lastPollTime;
    }

    public void setLastPollTime(long lastPollTime) {
        this.lastPollTime = lastPollTime;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }
        PollData pollData = (PollData) o;
        return getLastPollTime() == pollData.getLastPollTime()
                && Objects.equals(getQueueName(), pollData.getQueueName())
                && Objects.equals(getDomain(), pollData.getDomain())
                && Objects.equals(getWorkerId(), pollData.getWorkerId());
    }

    @Override
    public int hashCode() {
        return Objects.hash(getQueueName(), getDomain(), getWorkerId(), getLastPollTime());
    }

    @Override
    public String toString() {
        return "PollData{"
                + "queueName='"
                + queueName
                + '\''
                + ", domain='"
                + domain
                + '\''
                + ", workerId='"
                + workerId
                + '\''
                + ", lastPollTime="
                + lastPollTime
                + '}';
    }
}

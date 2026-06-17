package com.netflix.conductor.sqlite.util;

public class QueueStats {
    private Integer depth;

    private long nextDelivery;

    public void setDepth(Integer depth) {
        this.depth = depth;
    }

    public Integer getDepth() {
        return depth;
    }

    public void setNextDelivery(long nextDelivery) {
        this.nextDelivery = nextDelivery;
    }

    public long getNextDelivery() {
        return nextDelivery;
    }

    public String toString() {
        return "{nextDelivery: " + nextDelivery + " depth: " + depth + "}";
    }
}

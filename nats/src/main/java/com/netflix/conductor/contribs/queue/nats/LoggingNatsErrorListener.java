package com.netflix.conductor.contribs.queue.nats;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.nats.client.Connection;
import io.nats.client.ErrorListener;
import io.nats.client.JetStreamSubscription;
import io.nats.client.Message;

public class LoggingNatsErrorListener implements ErrorListener {
    private static final Logger LOG = LoggerFactory.getLogger(LoggingNatsErrorListener.class);

    @Override
    public void errorOccurred(Connection conn, String error) {
        LOG.error("Nats connection error occurred: {}", error);
    }

    @Override
    public void exceptionOccurred(Connection conn, Exception exp) {
        LOG.error("Nats connection exception occurred", exp);
    }

    @Override
    public void messageDiscarded(Connection conn, Message msg) {
        LOG.error("Nats message discarded, SID={}, ", msg.getSID());
    }

    @Override
    public void heartbeatAlarm(
            Connection conn,
            JetStreamSubscription sub,
            long lastStreamSequence,
            long lastConsumerSequence) {
        LOG.warn("Heartbit missed, subject={}", sub.getSubject());
    }
}

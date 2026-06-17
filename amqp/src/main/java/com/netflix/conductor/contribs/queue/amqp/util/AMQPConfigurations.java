package com.netflix.conductor.contribs.queue.amqp.util;

/**
 * @author Ritu Parathody
 */
public enum AMQPConfigurations {

    // queue exchange settings
    PARAM_EXCHANGE_TYPE("exchangeType"),
    PARAM_QUEUE_NAME("bindQueueName"),
    PARAM_ROUTING_KEY("routingKey"),
    PARAM_DELIVERY_MODE("deliveryMode"),
    PARAM_DURABLE("durable"),
    PARAM_EXCLUSIVE("exclusive"),
    PARAM_AUTO_DELETE("autoDelete"),
    PARAM_MAX_PRIORITY("maxPriority");

    String propertyName;

    AMQPConfigurations(String propertyName) {
        this.propertyName = propertyName;
    }

    @Override
    public String toString() {
        return propertyName;
    }
}

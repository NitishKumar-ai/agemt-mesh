package org.conductoross.conductor.core.execution;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Configuration
@ConfigurationProperties("conductor.app.sweeper")
@Getter
@Setter
@ToString
public class SweeperProperties {
    private int sweepBatchSize = 2;
    private int queuePopTimeout = 100;
}

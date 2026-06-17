package com.netflix.conductor;

import java.io.IOException;

import org.conductoross.conductor.RestConfiguration;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;

/** Copy of com.netflix.conductor.Conductor for use by @SpringBootTest in AbstractSpecification. */

// Prevents from the datasource beans to be loaded, AS they are needed only for specific databases.
// In case that SQL database is selected this class will be imported back in the appropriate
// database persistence module.
@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
@ComponentScan(
        basePackages = {"com.netflix.conductor", "io.orkes.conductor", "org.conductoross"},
        excludeFilters =
                @ComponentScan.Filter(
                        type = FilterType.ASSIGNABLE_TYPE,
                        classes = {RestConfiguration.class}))
public class ConductorTestApp {

    public static void main(String[] args) throws IOException {
        SpringApplication.run(ConductorTestApp.class, args);
    }
}

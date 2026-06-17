package org.conductoross.conductor.common;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface Documented {

    enum LifeCycle {
        BETA,
        DEPRECATED,
        GA
    }

    String usage() default "";

    boolean required() default false;

    LifeCycle lifecycle() default LifeCycle.GA;
}

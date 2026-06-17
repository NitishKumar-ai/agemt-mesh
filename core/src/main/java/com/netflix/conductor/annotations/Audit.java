package com.netflix.conductor.annotations;

import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

/** Mark service for custom audit implementation */
@Target({TYPE})
@Retention(RUNTIME)
public @interface Audit {}

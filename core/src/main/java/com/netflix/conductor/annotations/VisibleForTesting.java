package com.netflix.conductor.annotations;

import java.lang.annotation.*;

/**
 * Annotates a program element that exists, or is more widely visible than otherwise necessary, only
 * for use in test code.
 */
@Retention(RetentionPolicy.CLASS)
@Target({ElementType.FIELD, ElementType.TYPE, ElementType.METHOD})
@Documented
public @interface VisibleForTesting {}

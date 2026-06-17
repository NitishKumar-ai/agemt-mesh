package com.netflix.conductor.core.utils;

import java.util.concurrent.Semaphore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** A class wrapping a semaphore which holds the number of permits available for processing. */
public class SemaphoreUtil {

    private static final Logger LOGGER = LoggerFactory.getLogger(SemaphoreUtil.class);
    private final Semaphore semaphore;

    public SemaphoreUtil(int numSlots) {
        LOGGER.debug("Semaphore util initialized with {} permits", numSlots);
        semaphore = new Semaphore(numSlots);
    }

    /**
     * Signals if processing is allowed based on whether specified number of permits can be
     * acquired.
     *
     * @param numSlots the number of permits to acquire
     * @return {@code true} - if permit is acquired {@code false} - if permit could not be acquired
     */
    public boolean acquireSlots(int numSlots) {
        boolean acquired = semaphore.tryAcquire(numSlots);
        LOGGER.trace("Trying to acquire {} permit: {}", numSlots, acquired);
        return acquired;
    }

    /** Signals that processing is complete and the specified number of permits can be released. */
    public void completeProcessing(int numSlots) {
        LOGGER.trace("Completed execution; releasing permit");
        semaphore.release(numSlots);
    }

    /**
     * Gets the number of slots available for processing.
     *
     * @return number of available permits
     */
    public int availableSlots() {
        int available = semaphore.availablePermits();
        LOGGER.trace("Number of available permits: {}", available);
        return available;
    }
}

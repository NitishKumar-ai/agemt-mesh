package com.netflix.conductor.core.utils;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

@SuppressWarnings("ToArrayCallWithZeroLengthArrayArgument")
public class SemaphoreUtilTest {

    @Test
    public void testBlockAfterAvailablePermitsExhausted() throws Exception {
        int threads = 5;
        ExecutorService executorService = Executors.newFixedThreadPool(threads);
        SemaphoreUtil semaphoreUtil = new SemaphoreUtil(threads);

        List<CompletableFuture<Void>> futuresList = new ArrayList<>();
        IntStream.range(0, threads)
                .forEach(
                        t ->
                                futuresList.add(
                                        CompletableFuture.runAsync(
                                                () -> semaphoreUtil.acquireSlots(1),
                                                executorService)));

        CompletableFuture<Void> allFutures =
                CompletableFuture.allOf(
                        futuresList.toArray(new CompletableFuture[futuresList.size()]));

        allFutures.get();

        assertEquals(0, semaphoreUtil.availableSlots());
        assertFalse(semaphoreUtil.acquireSlots(1));

        executorService.shutdown();
    }

    @Test
    public void testAllowsPollingWhenPermitBecomesAvailable() throws Exception {
        int threads = 5;
        ExecutorService executorService = Executors.newFixedThreadPool(threads);
        SemaphoreUtil semaphoreUtil = new SemaphoreUtil(threads);

        List<CompletableFuture<Void>> futuresList = new ArrayList<>();
        IntStream.range(0, threads)
                .forEach(
                        t ->
                                futuresList.add(
                                        CompletableFuture.runAsync(
                                                () -> semaphoreUtil.acquireSlots(1),
                                                executorService)));

        CompletableFuture<Void> allFutures =
                CompletableFuture.allOf(
                        futuresList.toArray(new CompletableFuture[futuresList.size()]));
        allFutures.get();

        assertEquals(0, semaphoreUtil.availableSlots());
        semaphoreUtil.completeProcessing(1);

        assertTrue(semaphoreUtil.availableSlots() > 0);
        assertTrue(semaphoreUtil.acquireSlots(1));

        executorService.shutdown();
    }
}

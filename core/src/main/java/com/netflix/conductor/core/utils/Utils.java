package com.netflix.conductor.core.utils;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.*;

import org.apache.commons.lang3.StringUtils;

import com.netflix.conductor.core.exception.TransientException;

public class Utils {

    public static final String DECIDER_QUEUE = "_deciderQueue";

    /**
     * ID of the server. Can be host name, IP address or any other meaningful identifier
     *
     * @return canonical host name resolved for the instance, "unknown" if resolution fails
     */
    public static String getServerId() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            return "unknown";
        }
    }

    /**
     * Split string with "|" as delimiter.
     *
     * @param inputStr Input string
     * @return List of String
     */
    public static List<String> convertStringToList(String inputStr) {
        List<String> list = new ArrayList<>();
        if (StringUtils.isNotBlank(inputStr)) {
            list = Arrays.asList(inputStr.split("\\|"));
        }
        return list;
    }

    /**
     * Ensures the truth of an condition involving one or more parameters to the calling method.
     *
     * @param condition a boolean expression
     * @param errorMessage The exception message use if the input condition is not valid
     * @throws IllegalArgumentException if input condition is not valid.
     */
    public static void checkArgument(boolean condition, String errorMessage) {
        if (!condition) {
            throw new IllegalArgumentException(errorMessage);
        }
    }

    /**
     * This method checks if the object is null or empty.
     *
     * @param object input of type {@link Object}.
     * @param errorMessage The exception message use if the object is empty or null.
     * @throws NullPointerException if input object is not valid.
     */
    public static void checkNotNull(Object object, String errorMessage) {
        if (object == null) {
            throw new NullPointerException(errorMessage);
        }
    }

    /**
     * Used to determine if the exception is thrown due to a transient failure and the operation is
     * expected to succeed upon retrying.
     *
     * @param throwable the exception that is thrown
     * @return true - if the exception is a transient failure
     *     <p>false - if the exception is non-transient
     */
    public static boolean isTransientException(Throwable throwable) {
        if (throwable != null) {
            return throwable instanceof TransientException;
        }
        return true;
    }
}

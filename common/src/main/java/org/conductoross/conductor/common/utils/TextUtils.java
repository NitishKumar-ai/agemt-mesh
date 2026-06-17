package org.conductoross.conductor.common.utils;

public class TextUtils {

    public static String sanitizeForPostgres(String text) {
        if (text != null) {
            return text.replaceAll("\u0000|\\\\+u0000", "");
        }
        return null;
    }
}

package io.conductor.e2e.util;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class TestUtil {

    public static String getResourceAsString(String classpathResource) throws IOException {
        InputStream stream = TestUtil.class.getClassLoader().getResourceAsStream(classpathResource);
        assert stream != null;
        byte[] data = stream.readAllBytes();
        return new String(data, StandardCharsets.UTF_8);
    }
}

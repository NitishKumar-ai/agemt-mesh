package org.conductoross.conductor;

import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockServletContext;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class SpaInterceptorTest {

    private final SpaInterceptor spaInterceptor = new SpaInterceptor();

    @Test
    public void testAllowsSwaggerConfigUnderApiDocs() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest(
                        new MockServletContext(), "GET", "/api-docs/swagger-config");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(spaInterceptor.preHandle(request, response, new Object()));
    }

    @Test
    public void testForwardsSpaRoutesToIndexHtml() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest(new MockServletContext(), "GET", "/workflows");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(spaInterceptor.preHandle(request, response, new Object()));
        assertEquals("/index.html", response.getForwardedUrl());
    }
}

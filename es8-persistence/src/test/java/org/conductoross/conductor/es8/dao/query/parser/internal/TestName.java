package org.conductoross.conductor.es8.dao.query.parser.internal;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

/**
 * @author Viren
 */
public class TestName extends AbstractParserTest {

    @Test
    public void test() throws Exception {
        String test = "metadata.en_US.lang		";
        Name name = new Name(getInputStream(test));
        String nameVal = name.getName();
        assertNotNull(nameVal);
        assertEquals(test.trim(), nameVal);
    }
}

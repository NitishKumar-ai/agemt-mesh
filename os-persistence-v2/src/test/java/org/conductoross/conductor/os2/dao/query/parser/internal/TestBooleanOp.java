package org.conductoross.conductor.os2.dao.query.parser.internal;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

/**
 * @author Viren
 */
public class TestBooleanOp extends AbstractParserTest {

    @Test
    public void test() throws Exception {
        String[] tests = new String[] {"AND", "OR"};
        for (String test : tests) {
            BooleanOp name = new BooleanOp(getInputStream(test));
            String nameVal = name.getOperator();
            assertNotNull(nameVal);
            assertEquals(test, nameVal);
        }
    }

    @Test(expected = ParserException.class)
    public void testInvalid() throws Exception {
        String test = "<";
        BooleanOp name = new BooleanOp(getInputStream(test));
        String nameVal = name.getOperator();
        assertNotNull(nameVal);
        assertEquals(test, nameVal);
    }
}

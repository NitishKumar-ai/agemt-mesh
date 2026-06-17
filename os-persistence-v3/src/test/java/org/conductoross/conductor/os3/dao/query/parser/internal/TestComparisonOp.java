package org.conductoross.conductor.os3.dao.query.parser.internal;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

/**
 * @author Viren
 */
public class TestComparisonOp extends AbstractParserTest {

    @Test
    public void test() throws Exception {
        String[] tests = new String[] {"<", ">", "=", "!=", "IN", "BETWEEN", "STARTS_WITH"};
        for (String test : tests) {
            ComparisonOp name = new ComparisonOp(getInputStream(test));
            String nameVal = name.getOperator();
            assertNotNull(nameVal);
            assertEquals(test, nameVal);
        }
    }

    @Test(expected = ParserException.class)
    public void testInvalidOp() throws Exception {
        String test = "AND";
        ComparisonOp name = new ComparisonOp(getInputStream(test));
        String nameVal = name.getOperator();
        assertNotNull(nameVal);
        assertEquals(test, nameVal);
    }
}

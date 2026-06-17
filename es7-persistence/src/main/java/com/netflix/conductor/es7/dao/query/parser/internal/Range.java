package com.netflix.conductor.es7.dao.query.parser.internal;

import java.io.InputStream;

/**
 * @author Viren
 */
public class Range extends AbstractNode {

    private String low;

    private String high;

    public Range(InputStream is) throws ParserException {
        super(is);
    }

    @Override
    protected void _parse() throws Exception {
        this.low = readNumber(is);

        skipWhitespace();
        byte[] peeked = read(3);
        assertExpected(peeked, "AND");
        skipWhitespace();

        String num = readNumber(is);
        if (num == null || "".equals(num)) {
            throw new ParserException("Missing the upper range value...");
        }
        this.high = num;
    }

    private String readNumber(InputStream is) throws Exception {
        StringBuilder sb = new StringBuilder();
        while (is.available() > 0) {
            is.mark(1);
            char c = (char) is.read();
            if (!isNumeric(c)) {
                is.reset();
                break;
            } else {
                sb.append(c);
            }
        }
        String numValue = sb.toString().trim();
        return numValue;
    }

    /**
     * @return the low
     */
    public String getLow() {
        return low;
    }

    /**
     * @return the high
     */
    public String getHigh() {
        return high;
    }

    @Override
    public String toString() {
        return low + " AND " + high;
    }
}

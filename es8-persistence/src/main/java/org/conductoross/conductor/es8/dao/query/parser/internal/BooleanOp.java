package org.conductoross.conductor.es8.dao.query.parser.internal;

import java.io.InputStream;

/**
 * @author Viren
 */
public class BooleanOp extends AbstractNode {

    private String value;

    public BooleanOp(InputStream is) throws ParserException {
        super(is);
    }

    @Override
    protected void _parse() throws Exception {
        byte[] buffer = peek(3);
        if (buffer.length > 1 && buffer[0] == 'O' && buffer[1] == 'R') {
            this.value = "OR";
        } else if (buffer.length > 2 && buffer[0] == 'A' && buffer[1] == 'N' && buffer[2] == 'D') {
            this.value = "AND";
        } else {
            throw new ParserException("No valid boolean operator found...");
        }
        read(this.value.length());
    }

    @Override
    public String toString() {
        return " " + value + " ";
    }

    public String getOperator() {
        return value;
    }

    public boolean isAnd() {
        return "AND".equals(value);
    }

    public boolean isOr() {
        return "OR".equals(value);
    }
}

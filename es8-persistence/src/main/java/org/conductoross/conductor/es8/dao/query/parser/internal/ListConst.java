package org.conductoross.conductor.es8.dao.query.parser.internal;

import java.io.InputStream;
import java.util.LinkedList;
import java.util.List;

/**
 * @author Viren List of constants
 */
public class ListConst extends AbstractNode {

    private List<Object> values;

    public ListConst(InputStream is) throws ParserException {
        super(is);
    }

    @Override
    protected void _parse() throws Exception {
        byte[] peeked = read(1);
        assertExpected(peeked, "(");
        this.values = readList();
    }

    private List<Object> readList() throws Exception {
        List<Object> list = new LinkedList<Object>();
        boolean valid = false;
        char c;

        StringBuilder sb = new StringBuilder();
        while (is.available() > 0) {
            c = (char) is.read();
            if (c == ')') {
                valid = true;
                break;
            } else if (c == ',') {
                list.add(sb.toString().trim());
                sb = new StringBuilder();
            } else {
                sb.append(c);
            }
        }
        list.add(sb.toString().trim());
        if (!valid) {
            throw new ParserException("Expected ')' but never encountered in the stream");
        }
        return list;
    }

    public List<Object> getList() {
        return (List<Object>) values;
    }

    @Override
    public String toString() {
        return values.toString();
    }
}

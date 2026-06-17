package org.conductoross.conductor.es8.dao.query.parser.internal;

import java.io.InputStream;

/**
 * @author Viren Represents the name of the field to be searched against.
 */
public class Name extends AbstractNode {

    private String value;

    public Name(InputStream is) throws ParserException {
        super(is);
    }

    @Override
    protected void _parse() throws Exception {
        this.value = readToken();
    }

    @Override
    public String toString() {
        return value;
    }

    public String getName() {
        return value;
    }
}

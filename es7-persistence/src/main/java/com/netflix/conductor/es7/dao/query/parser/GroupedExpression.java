package com.netflix.conductor.es7.dao.query.parser;

import java.io.InputStream;

import org.elasticsearch.index.query.QueryBuilder;

import com.netflix.conductor.es7.dao.query.parser.internal.AbstractNode;
import com.netflix.conductor.es7.dao.query.parser.internal.ParserException;

/**
 * @author Viren
 */
public class GroupedExpression extends AbstractNode implements FilterProvider {

    private Expression expression;

    public GroupedExpression(InputStream is) throws ParserException {
        super(is);
    }

    @Override
    protected void _parse() throws Exception {
        byte[] peeked = read(1);
        assertExpected(peeked, "(");

        this.expression = new Expression(is);

        peeked = read(1);
        assertExpected(peeked, ")");
    }

    @Override
    public String toString() {
        return "(" + expression + ")";
    }

    /**
     * @return the expression
     */
    public Expression getExpression() {
        return expression;
    }

    @Override
    public QueryBuilder getFilterBuilder() {
        return expression.getFilterBuilder();
    }
}

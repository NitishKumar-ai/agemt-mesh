package org.conductoross.conductor.os3.dao.query.parser;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;

import org.conductoross.conductor.os3.dao.query.parser.internal.AbstractNode;
import org.conductoross.conductor.os3.dao.query.parser.internal.BooleanOp;
import org.conductoross.conductor.os3.dao.query.parser.internal.ParserException;
import org.opensearch.client.opensearch._types.query_dsl.Query;

/**
 * @author Viren
 */
public class Expression extends AbstractNode implements FilterProvider {

    private NameValue nameVal;

    private GroupedExpression ge;

    private BooleanOp op;

    private Expression rhs;

    public Expression(InputStream is) throws ParserException {
        super(is);
    }

    @Override
    protected void _parse() throws Exception {
        byte[] peeked = peek(1);

        if (peeked[0] == '(') {
            this.ge = new GroupedExpression(is);
        } else {
            this.nameVal = new NameValue(is);
        }

        peeked = peek(3);
        if (isBoolOpr(peeked)) {
            // we have an expression next
            this.op = new BooleanOp(is);
            this.rhs = new Expression(is);
        }
    }

    public boolean isBinaryExpr() {
        return this.op != null;
    }

    public BooleanOp getOperator() {
        return this.op;
    }

    public Expression getRightHandSide() {
        return this.rhs;
    }

    public boolean isNameValue() {
        return this.nameVal != null;
    }

    public NameValue getNameValue() {
        return this.nameVal;
    }

    public GroupedExpression getGroupedExpression() {
        return this.ge;
    }

    @Override
    public Query getFilter() {
        Query lhs = null;
        if (nameVal != null) {
            lhs = nameVal.getFilter();
        } else {
            lhs = ge.getFilter();
        }

        if (this.isBinaryExpr()) {
            Query rhsFilter = rhs.getFilter();
            if (this.op.isAnd()) {
                final Query lhsFinal = lhs;
                final Query rhsFinal = rhsFilter;
                return Query.of(q -> q.bool(b -> b.must(lhsFinal).must(rhsFinal)));
            } else {
                final Query lhsFinal = lhs;
                final Query rhsFinal = rhsFilter;
                return Query.of(q -> q.bool(b -> b.should(lhsFinal).should(rhsFinal)));
            }
        } else {
            return lhs;
        }
    }

    @Override
    public String toString() {
        if (isBinaryExpr()) {
            return "" + (nameVal == null ? ge : nameVal) + op + rhs;
        } else {
            return "" + (nameVal == null ? ge : nameVal);
        }
    }

    public static Expression fromString(String value) throws ParserException {
        return new Expression(new BufferedInputStream(new ByteArrayInputStream(value.getBytes())));
    }
}

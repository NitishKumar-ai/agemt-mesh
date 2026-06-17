package org.conductoross.conductor.es8.dao.query.parser;

import java.util.List;

import org.conductoross.conductor.es8.dao.query.parser.internal.AbstractParserTest;
import org.junit.Test;

import co.elastic.clients.elasticsearch._types.FieldValue;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class TestNameValueQueryBuilder extends AbstractParserTest {

    @Test
    public void equalsUsesTermQuery() throws Exception {
        NameValue nameValue = new NameValue(getInputStream("status='RUNNING'"));

        Query query = nameValue.getFilterBuilder();

        assertTrue(query.isTerm());
        assertEquals("status", query.term().field());
        assertTrue(query.term().value().isString());
        assertEquals("RUNNING", query.term().value().stringValue());
    }

    @Test
    public void notEqualsUsesMustNotTermQuery() throws Exception {
        NameValue nameValue = new NameValue(getInputStream("status!='RUNNING'"));

        Query query = nameValue.getFilterBuilder();

        assertTrue(query.isBool());
        assertEquals(1, query.bool().mustNot().size());
        Query mustNot = query.bool().mustNot().getFirst();
        assertTrue(mustNot.isTerm());
        assertEquals("status", mustNot.term().field());
        assertEquals("RUNNING", mustNot.term().value().stringValue());
    }

    @Test
    public void inNormalizesQuotedAndNumericValues() throws Exception {
        NameValue nameValue = new NameValue(getInputStream("priority IN (1, 2.5, '3')"));

        Query query = nameValue.getFilterBuilder();

        assertTrue(query.isTerms());
        List<FieldValue> values = query.terms().terms().value();
        assertEquals(3, values.size());
        assertTrue(values.get(0).isLong());
        assertEquals(1L, values.get(0).longValue());
        assertTrue(values.get(1).isDouble());
        assertEquals(2.5d, values.get(1).doubleValue(), 0.000001d);
        assertTrue(values.get(2).isString());
        assertEquals("3", values.get(2).stringValue());
    }

    @Test
    public void equalsWithDoubleQuotesUsesTermQuery() throws Exception {
        String uuid = "09d13af8-3a2a-48bf-a91d-ef0a9114f07a";
        NameValue nameValue = new NameValue(getInputStream("workflowId=\"" + uuid + "\""));

        Query query = nameValue.getFilterBuilder();

        assertTrue(query.isTerm());
        assertEquals("workflowId", query.term().field());
        assertTrue(query.term().value().isString());
        assertEquals(uuid, query.term().value().stringValue());
    }

    @Test
    public void equalsNullUsesMissingFieldQuery() throws Exception {
        NameValue nameValue = new NameValue(getInputStream("archived = null"));

        Query query = nameValue.getFilterBuilder();

        assertTrue(query.isBool());
        assertEquals(1, query.bool().mustNot().size());
        assertTrue(query.bool().mustNot().getFirst().isExists());
        assertEquals("archived", query.bool().mustNot().getFirst().exists().field());
    }
}

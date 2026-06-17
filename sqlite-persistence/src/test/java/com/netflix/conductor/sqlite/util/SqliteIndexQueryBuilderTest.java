package com.netflix.conductor.sqlite.util;

import java.sql.SQLException;
import java.util.ArrayList;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.Mockito;

import com.netflix.conductor.sqlite.config.SqliteProperties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

public class SqliteIndexQueryBuilderTest {

    private SqliteProperties properties = new SqliteProperties();

    @Test
    void shouldGenerateQueryForEmptyString() throws SQLException {
        SqliteIndexQueryBuilder builder =
                new SqliteIndexQueryBuilder(
                        "table_name", "", "", 0, 15, new ArrayList<>(), properties);
        String generatedQuery = builder.getQuery();
        assertEquals("SELECT json_data FROM table_name LIMIT ? OFFSET ?", generatedQuery);
    }

    @Test
    void shouldGenerateQueryForExactMatch() throws SQLException {
        String inputQuery = "workflowId=\"abc123\"";
        SqliteIndexQueryBuilder builder =
                new SqliteIndexQueryBuilder(
                        "table_name", inputQuery, "", 0, 15, new ArrayList<>(), properties);
        String generatedQuery = builder.getQuery();
        assertEquals(
                "SELECT json_data FROM table_name WHERE workflow_id = ? LIMIT ? OFFSET ?",
                generatedQuery);
        Query mockQuery = mock(Query.class);
        builder.addParameters(mockQuery);
        builder.addPagingParameters(mockQuery);
        InOrder inOrder = Mockito.inOrder(mockQuery);
        inOrder.verify(mockQuery).addParameter("abc123");
        inOrder.verify(mockQuery).addParameter(15);
        inOrder.verify(mockQuery).addParameter(0);
        verifyNoMoreInteractions(mockQuery);
    }

    @Test
    void shouldGenerateQueryWithWildcardPrefix() throws SQLException {
        String inputQuery = "workflowType=abc*";
        SqliteIndexQueryBuilder builder =
                new SqliteIndexQueryBuilder(
                        "table_name", inputQuery, "", 0, 15, new ArrayList<>(), properties);
        String generatedQuery = builder.getQuery();
        assertEquals(
                "SELECT json_data FROM table_name WHERE lower(workflow_type) LIKE lower(?) LIMIT ? OFFSET ?",
                generatedQuery);
        Query mockQuery = mock(Query.class);
        builder.addParameters(mockQuery);
        builder.addPagingParameters(mockQuery);
        InOrder inOrder = Mockito.inOrder(mockQuery);
        inOrder.verify(mockQuery).addParameter("abc%");
        inOrder.verify(mockQuery).addParameter(15);
        inOrder.verify(mockQuery).addParameter(0);
        verifyNoMoreInteractions(mockQuery);
    }

    @Test
    void shouldGenerateQueryWithWildcardContains() throws SQLException {
        String inputQuery = "correlationId=\"*order*\"";
        SqliteIndexQueryBuilder builder =
                new SqliteIndexQueryBuilder(
                        "table_name", inputQuery, "", 0, 15, new ArrayList<>(), properties);
        String generatedQuery = builder.getQuery();
        assertEquals(
                "SELECT json_data FROM table_name WHERE lower(correlation_id) LIKE lower(?) LIMIT ? OFFSET ?",
                generatedQuery);
        Query mockQuery = mock(Query.class);
        builder.addParameters(mockQuery);
        builder.addPagingParameters(mockQuery);
        InOrder inOrder = Mockito.inOrder(mockQuery);
        inOrder.verify(mockQuery).addParameter("%order%");
        inOrder.verify(mockQuery).addParameter(15);
        inOrder.verify(mockQuery).addParameter(0);
        verifyNoMoreInteractions(mockQuery);
    }

    @Test
    void shouldGenerateExactMatchQueryWhenNoWildcard() throws SQLException {
        String inputQuery = "workflowType=abc";
        SqliteIndexQueryBuilder builder =
                new SqliteIndexQueryBuilder(
                        "table_name", inputQuery, "", 0, 15, new ArrayList<>(), properties);
        String generatedQuery = builder.getQuery();
        assertEquals(
                "SELECT json_data FROM table_name WHERE workflow_type = ? LIMIT ? OFFSET ?",
                generatedQuery);
        Query mockQuery = mock(Query.class);
        builder.addParameters(mockQuery);
        builder.addPagingParameters(mockQuery);
        InOrder inOrder = Mockito.inOrder(mockQuery);
        inOrder.verify(mockQuery).addParameter("abc");
        inOrder.verify(mockQuery).addParameter(15);
        inOrder.verify(mockQuery).addParameter(0);
        verifyNoMoreInteractions(mockQuery);
    }

    @Test
    void shouldNotExpandWildcardInINClause() throws SQLException {
        String inputQuery = "status IN (COMP*,RUNNING)";
        SqliteIndexQueryBuilder builder =
                new SqliteIndexQueryBuilder(
                        "table_name", inputQuery, "", 0, 15, new ArrayList<>(), properties);
        String generatedQuery = builder.getQuery();
        assertEquals(
                "SELECT json_data FROM table_name WHERE status IN (?,?) LIMIT ? OFFSET ?",
                generatedQuery);
    }

    @Test
    void shouldGenerateQueryForParentWorkflowId() throws SQLException {
        String inputQuery = "parentWorkflowId=\"\"";
        SqliteIndexQueryBuilder builder =
                new SqliteIndexQueryBuilder(
                        "table_name", inputQuery, "", 0, 15, new ArrayList<>(), properties);
        String generatedQuery = builder.getQuery();
        assertEquals(
                "SELECT json_data FROM table_name WHERE parent_workflow_id = ? LIMIT ? OFFSET ?",
                generatedQuery);
        Query mockQuery = mock(Query.class);
        builder.addParameters(mockQuery);
        builder.addPagingParameters(mockQuery);
        InOrder inOrder = Mockito.inOrder(mockQuery);
        inOrder.verify(mockQuery).addParameter("");
        inOrder.verify(mockQuery).addParameter(15);
        inOrder.verify(mockQuery).addParameter(0);
        verifyNoMoreInteractions(mockQuery);
    }
}

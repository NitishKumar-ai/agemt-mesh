package org.conductoross.conductor.os3.dao.index;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;

import org.apache.hc.core5.http.HttpHost;
import org.junit.After;
import org.junit.Before;
import org.opensearch.client.Request;
import org.opensearch.client.Response;
import org.opensearch.client.RestClient;
import org.opensearch.client.RestClientBuilder;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.transport.rest_client.RestClientTransport;
import org.springframework.retry.support.RetryTemplate;

public abstract class OpenSearchRestDaoBaseTest extends OpenSearchTest {

    protected RestClient restClient;
    protected OpenSearchRestDAO indexDAO;

    @Before
    public void setup() throws Exception {
        String httpHostAddress = container.getHttpHostAddress();
        String host = httpHostAddress.split(":")[1].replace("//", "");
        int port = Integer.parseInt(httpHostAddress.split(":")[2]);

        properties.setUrl(httpHostAddress);

        RestClientBuilder restClientBuilder = RestClient.builder(new HttpHost("http", host, port));
        restClient = restClientBuilder.build();

        RestClientTransport transport =
                new RestClientTransport(restClient, new JacksonJsonpMapper(objectMapper));
        OpenSearchClient openSearchClient = new OpenSearchClient(transport);

        indexDAO =
                new OpenSearchRestDAO(
                        restClient,
                        openSearchClient,
                        new RetryTemplate(),
                        properties,
                        objectMapper);
        indexDAO.setup();
    }

    @After
    public void tearDown() throws Exception {
        deleteAllIndices();

        if (restClient != null) {
            restClient.close();
        }
    }

    private void deleteAllIndices() throws IOException {
        Response beforeResponse = restClient.performRequest(new Request("GET", "/_cat/indices"));
        Reader streamReader = new InputStreamReader(beforeResponse.getEntity().getContent());
        BufferedReader bufferedReader = new BufferedReader(streamReader);

        String line;
        while ((line = bufferedReader.readLine()) != null) {
            System.out.println("Deleting line: " + line);
            String[] fields = line.split("(\\s+)");
            String endpoint = String.format("/%s", fields[2]);
            System.out.println("Deleting index: " + endpoint);
            restClient.performRequest(new Request("DELETE", endpoint));
        }
    }
}

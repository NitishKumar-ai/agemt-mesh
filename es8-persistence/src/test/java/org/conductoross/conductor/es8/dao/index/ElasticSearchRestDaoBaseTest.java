package org.conductoross.conductor.es8.dao.index;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.time.Duration;

import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;
import org.junit.After;
import org.junit.Before;
import org.springframework.retry.support.RetryTemplate;

public abstract class ElasticSearchRestDaoBaseTest extends ElasticSearchTest {

    protected RestClient restClient;
    protected ElasticSearchRestDAOV8 indexDAO;

    @Before
    public void setup() throws Exception {
        String httpHostAddress = container.getHttpHostAddress();
        String host = httpHostAddress.split(":")[0];
        int port = Integer.parseInt(httpHostAddress.split(":")[1]);

        properties.setUrl("http://" + httpHostAddress);
        // Keep integration tests deterministic with near-immediate visibility in search.
        properties.setIndexRefreshInterval(Duration.ofMillis(100));
        properties.setWaitForIndexRefresh(true);

        RestClientBuilder restClientBuilder = RestClient.builder(new HttpHost(host, port, "http"));
        restClient = restClientBuilder.build();

        indexDAO =
                new ElasticSearchRestDAOV8(
                        restClientBuilder, new RetryTemplate(), properties, objectMapper);
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
            String[] fields = line.split("\\s");
            String endpoint = String.format("/%s", fields[2]);

            restClient.performRequest(new Request("DELETE", endpoint));
        }
    }
}

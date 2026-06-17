package io.orkes.conductor.mq.dao;

import java.util.concurrent.ExecutorService;

import com.netflix.conductor.core.config.ConductorProperties;
import com.netflix.conductor.dao.QueueDAO;
import com.netflix.conductor.redis.config.RedisProperties;
import com.netflix.conductor.redis.jedis.JedisCommands;

import io.orkes.conductor.mq.ConductorQueue;
import io.orkes.conductor.mq.redis.cluster.ConductorRedisClusterQueue;
import lombok.extern.slf4j.Slf4j;

@Slf4j
// FIXME: be aware that queues have their own prefix which is different from workflowNamespacePrefix
public class ClusteredRedisQueueDAO extends BaseRedisQueueDAO implements QueueDAO {

    private final JedisCommands jedisCommands;

    public ClusteredRedisQueueDAO(
            JedisCommands jedisCommands,
            RedisProperties redisProperties,
            ConductorProperties conductorProperties) {

        super(jedisCommands, redisProperties, conductorProperties);
        this.jedisCommands = jedisCommands;
        log.info("Queues initialized using {}", ClusteredRedisQueueDAO.class.getName());
    }

    @Override
    protected ConductorQueue getConductorQueue(String queueKey, ExecutorService executorService) {
        return new ConductorRedisClusterQueue(queueKey, jedisCommands, executorService);
    }
}

package com.netflix.conductor.test.base

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.TestPropertySource

import com.netflix.conductor.dao.QueueDAO

@TestPropertySource(properties = [
        "conductor.system-task-workers.enabled=false",
        "conductor.integ-test.queue-spy.enabled=true",
        "conductor.queue.type=xxx"
])
abstract class AbstractResiliencySpecification extends AbstractSpecification {

    @Autowired
    QueueDAO queueDAO
}

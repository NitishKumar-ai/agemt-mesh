package com.netflix.conductor.core.execution.tasks

import java.time.Duration

import com.netflix.conductor.common.metadata.tasks.TaskDef
import com.netflix.conductor.service.MetadataService

import spock.lang.Specification
import spock.lang.Subject

class IsolatedTaskQueueProducerSpec extends Specification {

    SystemTaskWorker systemTaskWorker
    MetadataService metadataService

    @Subject
    IsolatedTaskQueueProducer isolatedTaskQueueProducer

    def asyncSystemTask = new WorkflowSystemTask("asyncTask") {
        @Override
        boolean isAsync() {
            return true
        }
    }

    def setup() {
        systemTaskWorker = Mock(SystemTaskWorker.class)
        metadataService = Mock(MetadataService.class)

        isolatedTaskQueueProducer = new IsolatedTaskQueueProducer(metadataService, [asyncSystemTask] as Set, systemTaskWorker, false,
                Duration.ofSeconds(10))
    }

    def "addTaskQueuesAddsElementToQueue"() {
        given:
        TaskDef taskDef = new TaskDef(isolationGroupId: "isolated")

        when:
        isolatedTaskQueueProducer.addTaskQueues()

        then:
        1 * systemTaskWorker.startPolling(asyncSystemTask, "${asyncSystemTask.taskType}-${taskDef.isolationGroupId}")
        1 * metadataService.getTaskDefs() >> Collections.singletonList(taskDef)
    }
}

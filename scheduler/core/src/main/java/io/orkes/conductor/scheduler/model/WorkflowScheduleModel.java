package io.orkes.conductor.scheduler.model;

import org.springframework.beans.BeanUtils;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@ToString(callSuper = true)
@EqualsAndHashCode(callSuper = true)
public class WorkflowScheduleModel extends WorkflowSchedule {

    public static WorkflowScheduleModel from(WorkflowSchedule schedule) {
        WorkflowScheduleModel model = new WorkflowScheduleModel();
        BeanUtils.copyProperties(schedule, model);
        return model;
    }

    @JsonIgnore
    public String getQueueMsgId() {
        return getName();
    }
}

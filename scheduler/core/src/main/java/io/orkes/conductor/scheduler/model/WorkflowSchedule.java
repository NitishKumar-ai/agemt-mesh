package io.orkes.conductor.scheduler.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.netflix.conductor.common.metadata.workflow.StartWorkflowRequest;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
@Builder
public class WorkflowSchedule {

    private String name;
    private String cronExpression;
    private boolean runCatchupScheduleInstances;
    private boolean paused;
    private String pausedReason;
    @EqualsAndHashCode.Exclude private StartWorkflowRequest startWorkflowRequest;
    @Builder.Default private String zoneId = "UTC";

    /**
     * List of cron schedules for multi-expression configuration. When this list is not empty, it
     * takes priority over the single cronExpression/zoneId fields. Each entry in the list can have
     * its own cron expression and timezone. If a timezone is not specified for an entry, UTC is
     * used as the default.
     */
    @Setter(lombok.AccessLevel.NONE)
    @Getter(lombok.AccessLevel.NONE)
    private List<CronSchedule> cronSchedules;

    @JsonProperty("cronSchedules")
    public List<CronSchedule> getCronSchedules() {
        return cronSchedules != null ? cronSchedules : new ArrayList<>();
    }

    @JsonProperty("cronSchedules")
    public void setCronSchedules(List<CronSchedule> cronSchedules) {
        if (cronSchedules == null) {
            this.cronSchedules = new ArrayList<>();
        } else {
            // mutable
            this.cronSchedules = new ArrayList<>(cronSchedules);
        }
    }

    private Long scheduleStartTime;
    private Long scheduleEndTime;

    private Long createTime;
    private Long updatedTime;
    private String createdBy;
    private String updatedBy;
    private String description;
    private Long nextRunTime;

    /**
     * Returns the effective list of cron schedules. If cronSchedules list is not empty, returns
     * that list. Otherwise, returns a single-element list with the cronExpression and zoneId from
     * this schedule.
     *
     * @return list of effective cron schedules, never null
     */
    @JsonIgnore
    public List<CronSchedule> getEffectiveCronSchedules() {
        if (cronSchedules != null && !cronSchedules.isEmpty()) {
            return cronSchedules;
        }
        if (cronExpression != null) {
            return Collections.singletonList(
                    CronSchedule.builder()
                            .cronExpression(cronExpression)
                            .zoneId(zoneId != null ? zoneId : "UTC")
                            .build());
        }
        return Collections.emptyList();
    }

    @JsonIgnore
    public boolean hasMultipleCronSchedules() {
        return cronSchedules != null && !cronSchedules.isEmpty();
    }
}

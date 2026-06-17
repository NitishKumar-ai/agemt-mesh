package com.netflix.conductor.service;

import java.util.List;

import org.springframework.validation.annotation.Validated;

import com.netflix.conductor.common.model.BulkResponse;
import com.netflix.conductor.model.WorkflowModel;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

@Validated
public interface WorkflowBulkService {

    int MAX_REQUEST_ITEMS = 1000;

    BulkResponse<String> pauseWorkflow(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds);

    BulkResponse<String> resumeWorkflow(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds);

    BulkResponse<String> restart(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds,
            boolean useLatestDefinitions);

    BulkResponse<String> retry(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds);

    BulkResponse<String> terminate(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds,
            String reason);

    BulkResponse<String> deleteWorkflow(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds,
            boolean archiveWorkflow);

    BulkResponse<String> terminateRemove(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds,
            String reason,
            boolean archiveWorkflow);

    BulkResponse<WorkflowModel> searchWorkflow(
            @NotEmpty(message = "WorkflowIds list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} workflows. Please use multiple requests.")
                    List<String> workflowIds,
            boolean includeTasks);
}

// ui-next/src/pages/Dashboard.tsx
import { Box, CircularProgress, Grid, Paper, Typography, Button } from "@mui/material";
import { Play as PlayIcon, ArrowClockwise as RefreshIcon } from "@phosphor-icons/react";
import { DataTable, Heading } from "components";
import { SnackbarMessage } from "components/ui/SnackbarMessage";
import SectionContainer from "components/ui/layout/SectionContainer";
import SectionHeader from "components/layout/SectionHeader";
import SectionHeaderActions from "components/ui/layout/SectionHeaderActions";
import NoDataComponent from "components/ui/NoDataComponent";
import StatusBadge from "components/StatusBadge";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery } from "react-query";
import { api } from "../lib/api";
import { ColumnCustomType } from "components/ui/DataTable/types";
import { WorkflowExecutionStatus } from "types/Execution"; // Assuming this type exists
import { useNavigate } from "react-router-dom";
import { RUN_WORKFLOW_URL } from "utils/constants/route";

interface HealthStatus {
  status: string;
}

interface Workflow {
  workflowId: string;
  workflowName: string;
  status: WorkflowExecutionStatus;
  startTime: number;
  endTime?: number;
  // Add other workflow properties as needed
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [toastMessage, setToastMessage] = useState(null);

  const { data: health, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery<HealthStatus>(
    "healthStatus",
    api.getHealth,
    {
      refetchInterval: 5000, // Refresh health every 5 seconds
      onError: (error: any) => {
        setToastMessage({
          text: `Failed to fetch health status: ${error.message}`,
          severity: "error",
        });
      },
    }
  );

  const { data: workflows, isLoading: isLoadingWorkflows, refetch: refetchWorkflows } = useQuery<Workflow[]>(
    "workflows",
    () => api.listWorkflows(),
    {
      refetchInterval: 10000, // Refresh workflows every 10 seconds
      onError: (error: any) => {
        setToastMessage({
          text: `Failed to fetch workflows: ${error.message}`,
          severity: "error",
        });
      },
    }
  );

  const workflowCounts = useMemo(() => {
    const counts = { running: 0, completed: 0, failed: 0, total: 0 };
    if (workflows) {
      counts.total = workflows.length;
      workflows.forEach((wf) => {
        if (wf.status === WorkflowExecutionStatus.RUNNING) counts.running++;
        else if (wf.status === WorkflowExecutionStatus.COMPLETED) counts.completed++;
        else if (wf.status === WorkflowExecutionStatus.FAILED) counts.failed++;
      });
    }
    return counts;
  }, [workflows]);

  const recentWorkflows = useMemo(() => {
    if (workflows) {
      return [...workflows]
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, 10);
    }
    return [];
  }, [workflows]);

  const workflowColumns = useMemo(
    () => [
      {
        id: "workflowName",
        name: "workflowName",
        label: "Workflow Name",
        renderer: (val: string) => <Heading level={3}>{val}</Heading>,
        tooltip: "The name of the workflow",
      },
      {
        id: "workflowId",
        name: "workflowId",
        label: "ID",
        tooltip: "Unique identifier for the workflow",
      },
      {
        id: "status",
        name: "status",
        label: "Status",
        renderer: (val: WorkflowExecutionStatus) => <StatusBadge status={val} />,
        tooltip: "Current status of the workflow",
      },
      {
        id: "startTime",
        name: "startTime",
        label: "Start Time",
        type: ColumnCustomType.DATE,
        tooltip: "When the workflow started",
      },
      {
        id: "endTime",
        name: "endTime",
        label: "End Time",
        type: ColumnCustomType.DATE,
        tooltip: "When the workflow ended",
      },
      // Add action to view workflow details
      {
        id: "actions",
        name: "actions",
        label: "Actions",
        sortable: false,
        searchable: false,
        grow: 0.5,
        minWidth: "100px",
        renderer: (_: string, workflow: Workflow) => (
          <Button onClick={() => navigate(`/execution/${workflow.workflowId}`)} size="small" variant="outlined">
            View
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <>
      <Helmet>
        <title>Dashboard</title>
      </Helmet>

      {toastMessage && (
        <SnackbarMessage
          autoHideDuration={3000}
          id="dashboard-toast-message"
          message={toastMessage.text}
          severity={toastMessage.severity}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      <SectionHeader
        _deprecate_marginTop={0}
        title="Dashboard"
        actions={
          <SectionHeaderActions
            buttons={[
              {
                label: "Start Workflow",
                color: "primary",
                onClick: () => navigate(RUN_WORKFLOW_URL),
                startIcon: <PlayIcon />,
              },
              {
                label: "Refresh All",
                color: "secondary",
                onClick: () => { refetchHealth(); refetchWorkflows(); },
                startIcon: <RefreshIcon />,
              },
            ]}
          />
        }
      />
      <SectionContainer>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Heading level={2}>Server Health</Heading>
              {isLoadingHealth ? (
                <CircularProgress size={20} />
              ) : (
                <Typography variant="h6" color={health?.status === "UP" ? "green" : "red"}>
                  Status: {health?.status || "UNKNOWN"}
                </Typography>
              )}
            </Paper>
          </Grid>
          <Grid item xs={12} md={8}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Heading level={2}>Workflow Overview</Heading>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Typography variant="body1">Running: {workflowCounts.running}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body1">Completed: {workflowCounts.completed}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body1">Failed: {workflowCounts.failed}</Typography>
                </Grid>
              </Grid>
              <Typography variant="body1" sx={{ mt: 2 }}>Total Workflows: {workflowCounts.total}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Heading level={2}>Recent Workflow Executions (Last 10)</Heading>
              {isLoadingWorkflows ? (
                <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : recentWorkflows.length > 0 ? (
                <DataTable
                  localStorageKey="recentWorkflowsTable"
                  keyField="workflowId"
                  data={recentWorkflows}
                  columns={workflowColumns}
                  defaultShowColumns={["workflowName", "status", "startTime", "endTime", "actions"]}
                  noDataComponent={<NoDataComponent title="No Recent Workflows" description="No workflows have been executed recently." />}
                  pagination={{enabled:false}}
                />
              ) : (
                <NoDataComponent title="No Recent Workflows" description="No workflows have been executed recently." />
              )}
            </Paper>
          </Grid>
        </Grid>
      </SectionContainer>
    </>
  );
}

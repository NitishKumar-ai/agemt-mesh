import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  Play as PlayIcon,
  ArrowClockwise as RefreshIcon,
} from "@phosphor-icons/react";
import { DataTable, Heading } from "components";
import { SnackbarMessage } from "components/ui/SnackbarMessage";
import SectionContainer from "components/ui/layout/SectionContainer";
import SectionHeader from "components/layout/SectionHeader";
import SectionHeaderActions from "components/ui/layout/SectionHeaderActions";
import NoDataComponent from "components/ui/NoDataComponent";
import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { RUN_WORKFLOW_URL } from "utils/constants/route";
import { api, WorkflowSummary } from "lib/api";
import { PopoverMessage } from "types/Messages";
import { ColumnCustomType } from "components/ui/DataTable/types";

const STATUS_COLORS: Record<string, "success" | "error" | "warning" | "info" | "default"> = {
  COMPLETED: "success",
  FAILED: "error",
  TIMED_OUT: "error",
  RUNNING: "info",
  PAUSED: "warning",
  TERMINATED: "default",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [toastMessage, setToastMessage] = useState<PopoverMessage | null>(null);

  const { data: health, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery(
    "healthStatus",
    api.getHealth,
    {
      refetchInterval: 5000,
      onError: (err: any) => {
        setToastMessage({ text: `Health check failed: ${err.message}`, severity: "error" });
      },
    }
  );

  const { data: workflows, isLoading: isLoadingWorkflows, refetch: refetchWorkflows } = useQuery<WorkflowSummary[]>(
    "workflows",
    () => api.listWorkflows(),
    {
      refetchInterval: 10000,
      onError: (err: any) => {
        setToastMessage({ text: `Failed to fetch workflows: ${err.message}`, severity: "error" });
      },
    }
  );

  const counts = useMemo(() => {
    const base = { running: 0, completed: 0, failed: 0, total: 0 };
    if (!workflows) return base;
    base.total = workflows.length;
    for (const wf of workflows) {
      if (wf.status === "RUNNING") base.running++;
      else if (wf.status === "COMPLETED") base.completed++;
      else if (wf.status === "FAILED" || wf.status === "TIMED_OUT") base.failed++;
    }
    return base;
  }, [workflows]);

  const recentWorkflows = useMemo(
    () => [...(workflows ?? [])].sort((a, b) => b.startTime - a.startTime).slice(0, 10),
    [workflows]
  );

  const columns = useMemo(
    () => [
      {
        id: "workflowType",
        name: "workflowType",
        label: "Workflow",
        renderer: (val: string) => <Heading level={3}>{val}</Heading>,
      },
      {
        id: "workflowId",
        name: "workflowId",
        label: "ID",
      },
      {
        id: "status",
        name: "status",
        label: "Status",
        renderer: (val: string) => (
          <Chip label={val} size="small" color={STATUS_COLORS[val] ?? "default"} />
        ),
      },
      {
        id: "startTime",
        name: "startTime",
        label: "Started",
        type: ColumnCustomType.DATE,
      },
      {
        id: "endTime",
        name: "endTime",
        label: "Ended",
        type: ColumnCustomType.DATE,
      },
      {
        id: "actions",
        name: "actions",
        label: "",
        sortable: false,
        searchable: false,
        grow: 0.4,
        minWidth: "80px",
        renderer: (_: string, wf: WorkflowSummary) => (
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate(`/execution/${wf.workflowId}`)}
          >
            View
          </Button>
        ),
      },
    ],
    [navigate]
  );

  return (
    <>
      <Helmet>
        <title>Dashboard</title>
      </Helmet>

      {toastMessage && (
        <SnackbarMessage
          autoHideDuration={4000}
          id="dashboard-toast"
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
                label: "Refresh",
                color: "secondary",
                onClick: () => { refetchHealth(); refetchWorkflows(); },
                startIcon: <RefreshIcon />,
              },
            ]}
          />
        }
      />

      <SectionContainer>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mb: 3 }}>
          {/* Server Health */}
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
            <Heading level={2}>Server Health</Heading>
            {isLoadingHealth ? (
              <CircularProgress size={20} />
            ) : (
              <Typography
                variant="h6"
                color={health?.status === "OK" ? "success.main" : "error.main"}
              >
                {health?.status ?? "UNKNOWN"}
                {health?.version ? (
                  <Typography component="span" variant="caption" sx={{ ml: 1 }} color="text.secondary">
                    v{health.version}
                  </Typography>
                ) : null}
              </Typography>
            )}
          </Paper>

          {/* Workflow Counts */}
          <Paper variant="outlined" sx={{ p: 2, flex: 2 }}>
            <Heading level={2}>Workflow Overview</Heading>
            <Stack direction="row" spacing={4} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="h4" color="info.main">{counts.running}</Typography>
                <Typography variant="body2" color="text.secondary">Running</Typography>
              </Box>
              <Box>
                <Typography variant="h4" color="success.main">{counts.completed}</Typography>
                <Typography variant="body2" color="text.secondary">Completed</Typography>
              </Box>
              <Box>
                <Typography variant="h4" color="error.main">{counts.failed}</Typography>
                <Typography variant="body2" color="text.secondary">Failed</Typography>
              </Box>
              <Box>
                <Typography variant="h4">{counts.total}</Typography>
                <Typography variant="body2" color="text.secondary">Total</Typography>
              </Box>
            </Stack>
          </Paper>
        </Stack>

        {/* Recent Executions */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Heading level={2}>Recent Workflow Executions</Heading>
          {isLoadingWorkflows ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : recentWorkflows.length > 0 ? (
            <DataTable
              localStorageKey="dashboardRecentWorkflows"
              keyField="workflowId"
              data={recentWorkflows}
              columns={columns}
              noDataComponent={
                <NoDataComponent title="No Workflows" description="No workflow executions yet." />
              }
            />
          ) : (
            <NoDataComponent
              title="No Workflows"
              description="No workflow executions yet. Start a workflow to see it here."
            />
          )}
        </Paper>
      </SectionContainer>
    </>
  );
}

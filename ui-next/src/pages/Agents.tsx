import {
  Box,
  Chip,
  Tooltip,
  IconButton,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Typography,
  Alert,
} from "@mui/material";
import {
  Play as PlayIcon,
  ArrowClockwise as RefreshIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from "@phosphor-icons/react";
import { DataTable, Paper, Heading } from "components";
import { SnackbarMessage } from "components/ui/SnackbarMessage";
import SectionContainer from "components/ui/layout/SectionContainer";
import SectionHeader from "components/layout/SectionHeader";
import SectionHeaderActions from "components/ui/layout/SectionHeaderActions";
import NoDataComponent from "components/ui/NoDataComponent";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { api, Agent } from "lib/api";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { PopoverMessage } from "types/Messages";

export default function Agents() {
  const queryClient = useQueryClient();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [killswitchReason, setKillswitchReason] = useState("");
  const [killswitchDialogOpen, setKillswitchDialogOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<PopoverMessage | null>(null);
  const [eventLog, setEventLog] = useState<any[]>([]);

  const { data: agents, isLoading: agentsLoading, refetch: refetchAgents } = useQuery<Agent[]>(
    "agents",
    api.listAgents,
    { refetchInterval: 15000 }
  );

  const { data: killswitch, refetch: refetchKillswitch } = useQuery(
    "killswitch",
    api.getKillswitch,
    { refetchInterval: 10000 }
  );

  const runMutation = useMutation(
    ({ agentId, goal, context }: { agentId: string; goal: string; context: string }) =>
      api.runAgent(agentId, { goal, context }),
    {
      onSuccess: (data) => {
        setToastMessage({ text: `Agent started — workflow ${data.workflowId}`, severity: "success" });
        setRunDialogOpen(false);
        setGoal("");
        setContext("");
        refetchAgents();
      },
      onError: (err: any) => {
        setToastMessage({ text: `Failed to start agent: ${err.message}`, severity: "error" });
      },
    }
  );

  const killswitchMutation = useMutation(
    ({ engage, reason }: { engage: boolean; reason?: string }) =>
      engage ? api.engageKillswitch(reason || "Manual stop") : api.releaseKillswitch(),
    {
      onSuccess: () => {
        setToastMessage({ text: "Killswitch updated", severity: "success" });
        setKillswitchDialogOpen(false);
        setKillswitchReason("");
        refetchKillswitch();
      },
      onError: (err: any) => {
        setToastMessage({ text: `Killswitch action failed: ${err.message}`, severity: "error" });
      },
    }
  );

  useEffect(() => {
    const unsubscribe = api.subscribeToEvents((event) => {
      setEventLog((prev) => [event, ...prev].slice(0, 20));
    });
    return () => unsubscribe();
  }, []);

  const columns = useMemo(
    () => [
      {
        id: "name",
        name: "name",
        label: "Agent Name",
        renderer: (val: string) => <Heading level={3}>{val}</Heading>,
      },
      {
        id: "description",
        name: "description",
        label: "Description",
        grow: 2,
      },
      {
        id: "agentId",
        name: "agentId",
        label: "ID",
      },
      {
        id: "status",
        name: "status",
        label: "Status",
        renderer: (val: string) => (
          <Chip
            label={val}
            size="small"
            color={val === "running" ? "success" : "default"}
          />
        ),
      },
      {
        id: "modelExecute",
        name: "modelExecute",
        label: "Model",
      },
      {
        id: "actions",
        name: "actions",
        label: "Actions",
        sortable: false,
        searchable: false,
        grow: 0.5,
        minWidth: "80px",
        renderer: (_: string, agent: Agent) => (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Tooltip title="Run Agent">
              <span>
                <IconButton
                  onClick={() => {
                    setSelectedAgent(agent);
                    setGoal("");
                    setContext("");
                    setRunDialogOpen(true);
                  }}
                  size="small"
                  disabled={agent.status === "running"}
                >
                  <PlayIcon size={20} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ),
      },
    ],
    []
  );

  return (
    <>
      <Helmet>
        <title>Agents</title>
      </Helmet>

      {toastMessage && (
        <SnackbarMessage
          autoHideDuration={4000}
          id="agent-toast"
          message={toastMessage.text}
          severity={toastMessage.severity}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {/* Killswitch banner */}
      {killswitch?.engaged && (
        <Alert severity="error" sx={{ mx: 2, mt: 2 }} icon={<WarningIcon />}>
          <strong>Killswitch is ENGAGED</strong> — all agents are halted.
          <Button
            size="small"
            sx={{ ml: 2 }}
            variant="outlined"
            color="inherit"
            onClick={() => killswitchMutation.mutate({ engage: false })}
          >
            Release
          </Button>
        </Alert>
      )}

      <SectionHeader
        _deprecate_marginTop={0}
        title="Registered Agents"
        actions={
          <SectionHeaderActions
            buttons={[
              {
                label: killswitch?.engaged ? "Release Killswitch" : "Engage Killswitch",
                color: killswitch?.engaged ? "secondary" : "error" as any,
                onClick: () => {
                  if (killswitch?.engaged) {
                    killswitchMutation.mutate({ engage: false });
                  } else {
                    setKillswitchDialogOpen(true);
                  }
                },
                startIcon: <WarningIcon />,
              },
              {
                label: "Refresh",
                color: "secondary",
                onClick: () => refetchAgents(),
                startIcon: <RefreshIcon />,
              },
            ]}
          />
        }
      />

      <SectionContainer>
        <Paper id="agents-table-wrapper" variant="outlined">
          {agentsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : agents && agents.length > 0 ? (
            <DataTable
              localStorageKey="agentsTable"
              quickSearchEnabled
              quickSearchPlaceholder="Search agents"
              keyField="agentId"
              data={agents}
              columns={columns}
              noDataComponent={
                <NoDataComponent
                  title="No Agents Found"
                  description="No registered agents. Agents are registered via the agent-runtime."
                />
              }
            />
          ) : (
            <NoDataComponent
              title="No Agents Found"
              description="No registered agents. Start server-lite to seed demo agents."
            />
          )}
        </Paper>
      </SectionContainer>

      <SectionHeader title="Live Event Feed" />
      <SectionContainer>
        <Paper variant="outlined" sx={{ p: 2, maxHeight: 280, overflow: "auto" }}>
          {eventLog.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Waiting for events from SSE stream…
            </Typography>
          ) : (
            <Box sx={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
              {eventLog.map((event, i) => (
                <Box key={i} sx={{ mb: 1, pb: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                  {JSON.stringify(event, null, 2)}
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      </SectionContainer>

      {/* Run Agent Dialog */}
      <Dialog open={runDialogOpen} onClose={() => setRunDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Run Agent: {selectedAgent?.name}</DialogTitle>
        <DialogContent>
          <TextField
            label="Goal"
            fullWidth
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            margin="normal"
            placeholder="What should this agent accomplish?"
            required
          />
          <TextField
            label="Context (optional)"
            multiline
            rows={4}
            fullWidth
            value={context}
            onChange={(e) => setContext(e.target.value)}
            margin="normal"
            placeholder="Additional context, data, or instructions for the agent"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!selectedAgent) return;
              runMutation.mutate({ agentId: selectedAgent.agentId, goal, context });
            }}
            disabled={!goal.trim() || runMutation.isLoading}
            variant="contained"
            color="primary"
          >
            {runMutation.isLoading ? "Starting…" : "Run"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Killswitch Engage Dialog */}
      <Dialog open={killswitchDialogOpen} onClose={() => setKillswitchDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Engage Killswitch</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will immediately halt all running agents.
          </Alert>
          <TextField
            label="Reason"
            fullWidth
            value={killswitchReason}
            onChange={(e) => setKillswitchReason(e.target.value)}
            placeholder="Why are you engaging the killswitch?"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKillswitchDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => killswitchMutation.mutate({ engage: true, reason: killswitchReason })}
            variant="contained"
            color="error"
            disabled={killswitchMutation.isLoading}
          >
            Engage
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

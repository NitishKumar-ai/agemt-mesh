// ui-next/src/pages/Agents.tsx
import { Box, Tooltip, IconButton, Button, CircularProgress, Dialog, DialogTitle, DialogContent, TextField, DialogActions } from "@mui/material";
import { Play as PlayIcon, Trash as DeleteIcon, Monitor as MonitorIcon, ArrowClockwise as RefreshIcon } from "@phosphor-icons/react";
import { DataTable, Paper, Heading } from "components";
import { SnackbarMessage } from "components/ui/SnackbarMessage";
import SectionContainer from "components/ui/layout/SectionContainer";
import SectionHeader from "components/layout/SectionHeader";
import SectionHeaderActions from "components/ui/layout/SectionHeaderActions";
import NoDataComponent from "components/ui/NoDataComponent";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { api } from "../lib/api";
import { useQuery } from "react-query";
import { ColumnCustomType } from "components/ui/DataTable/types";
import ConfirmChoiceDialog from "components/ui/dialogs/ConfirmChoiceDialog";
import { PopoverMessage } from "types/Messages";

interface Agent {
  id: string;
  name: string;
  description: string;
  // Add other agent properties as needed
}

export default function Agents() {
  const [runAgentModalOpen, setRunAgentModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [inputJson, setInputJson] = useState('{}');
  const [toastMessage, setToastMessage] = useState<PopoverMessage | null>(null);
  const [eventLog, setEventLog] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    confirmDelete: boolean;
    agentId: string;
    agentName: string;
  } | null>(null);


  const { data: agents, isLoading, refetch } = useQuery<Agent[]>(
    "agents",
    api.listAgents,
    {
      refetchInterval: 15000, // Refresh agents list every 15 seconds
    }
  );

  useEffect(() => {
    const unsubscribe = api.subscribeToEvents((event) => {
      setEventLog((prevLog) => {
        const newLog = [event, ...prevLog].slice(0, 10); // Keep last 10 events
        return newLog;
      });
    });
    return () => unsubscribe();
  }, []);

  const handleRunAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setRunAgentModalOpen(true);
    setInputJson('{}'); // Reset input JSON
  };

  const handleRunAgent = async () => {
    if (!selectedAgent) return;
    try {
      const input = JSON.parse(inputJson);
      await api.runAgent(selectedAgent.id, input);
      setToastMessage({
        text: `Agent ${selectedAgent.name} started successfully!`,
        severity: "success",
      });
      setRunAgentModalOpen(false);
      refetch(); // Refresh agent list in case status changes
    } catch (error: any) {
      setToastMessage({
        text: `Failed to start agent ${selectedAgent.name}: ${error.message}`,
        severity: "error",
      });
    }
  };

  const handleDeleteAgentClick = (agent: Agent) => {
    setConfirmDelete({
      confirmDelete: true,
      agentId: agent.id,
      agentName: agent.name,
    });
  };

  const handleDeleteAgent = async () => {
    if (!confirmDelete) return;
    try {
      // Assuming there's a deleteAgent API call, if not, this will need adjustment
      // await api.deleteAgent(confirmDelete.agentId);
      setToastMessage({
        text: `Agent ${confirmDelete.agentName} deleted successfully! (Simulated)`,
        severity: "success",
      });
      setConfirmDelete(null);
      refetch();
    } catch (error: any) {
      setToastMessage({
        text: `Failed to delete agent ${confirmDelete.agentName}: ${error.message}`,
        severity: "error",
      });
      setConfirmDelete(null);
    }
  };


  const columns = useMemo(
    () => [
      {
        id: "name",
        name: "name",
        label: "Agent Name",
        renderer: (val: string) => <Heading level={3}>{val}</Heading>,
        tooltip: "The name of the agent",
      },
      {
        id: "description",
        name: "description",
        label: "Description",
        grow: 2,
        tooltip: "Description of the agent",
      },
      {
        id: "id",
        name: "id",
        label: "ID",
        tooltip: "Unique identifier for the agent",
      },
      {
        id: "actions",
        name: "actions",
        label: "Actions",
        sortable: false,
        searchable: false,
        grow: 0.5,
        minWidth: "150px",
        renderer: (_: string, agent: Agent) => (
          <Box sx={{ display: "flex", justifyContent: "space-evenly" }}>
            <Tooltip title="Run Agent">
              <IconButton onClick={() => handleRunAgentClick(agent)} size="small">
                <PlayIcon size={22} />
              </IconButton>
            </Tooltip>
            {/* Add delete action if applicable */}
            {/* <Tooltip title="Delete Agent">
              <IconButton onClick={() => handleDeleteAgentClick(agent)} size="small" color="error">
                <DeleteIcon size={20} />
              </IconButton>
            </Tooltip> */}
          </Box>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <Helmet>
        <title>Agents</title>
      </Helmet>

      {toastMessage && (
        <SnackbarMessage
          autoHideDuration={3000}
          id="agent-toast-message"
          message={toastMessage.text}
          severity={toastMessage.severity}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmChoiceDialog
          handleConfirmationValue={(selectedChoice) => {
            if (selectedChoice) {
              handleDeleteAgent();
            } else {
              setConfirmDelete(null);
            }
          }}
          message={
            <>
              Are you sure you want to delete Agent{" "}
              <strong style={{ color: "red" }}>{confirmDelete.agentName}</strong>? This cannot be undone.
              <div style={{ marginTop: "15px" }}>
                Please type <strong>{confirmDelete.agentName}</strong> to confirm.
              </div>
            </>
          }
          header={"Deletion Confirmation"}
          isInputConfirmation
          valueToBeDeleted={confirmDelete.agentName}
        />
      )}

      <SectionHeader
        _deprecate_marginTop={0}
        title="Registered Agents"
        actions={
          <SectionHeaderActions
            buttons={[
              {
                label: "Refresh",
                color: "secondary",
                onClick: () => refetch(),
                startIcon: <RefreshIcon />,
              },
            ]}
          />
        }
      />
      <SectionContainer>
        <Paper id="agents-table-wrapper" variant="outlined">
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : agents && agents.length > 0 ? (
            <DataTable
              localStorageKey="agentsTable"
              quickSearchEnabled
              quickSearchPlaceholder="Search agents"
              keyField="id"
              data={agents}
              columns={columns}
              noDataComponent={
                <NoDataComponent
                  title="No Agents Found"
                  description="There are no registered agents. Agents allow you to automate tasks and workflows."
                />
              }
            />
          ) : (
            <NoDataComponent
              title="No Agents Found"
              description="There are no registered agents. Agents allow you to automate tasks and workflows."
            />
          )}
        </Paper>
      </SectionContainer>

      <SectionHeader title="Live Event Feed" />
      <SectionContainer>
        <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
          {eventLog.length === 0 ? (
            <NoDataComponent title="No Events Yet" description="Waiting for live events..." />
          ) : (
            <Box sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {eventLog.map((event, index) => (
                <div key={index}>{JSON.stringify(event, null, 2)}</div>
              ))}
            </Box>
          )}
        </Paper>
      </SectionContainer>


      <Dialog open={runAgentModalOpen} onClose={() => setRunAgentModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Run Agent: {selectedAgent?.name}</DialogTitle>
        <DialogContent>
          <TextField
            label="Input JSON"
            multiline
            rows={10}
            fullWidth
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            margin="normal"
            variant="outlined"
            InputProps={{ style: { fontFamily: 'monospace' } }}
            error={!isJsonValid(inputJson)}
            helperText={!isJsonValid(inputJson) ? 'Invalid JSON' : ''}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunAgentModalOpen(false)}>Cancel</Button>
          <Button onClick={handleRunAgent} disabled={!isJsonValid(inputJson)} variant="contained" color="primary">
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const isJsonValid = (str: string) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

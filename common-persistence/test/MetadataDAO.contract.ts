import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { MetadataDAO } from '../src/MetadataDAO.js';
import type { TaskDef, WorkflowDef, EventHandler } from '@agentmesh/common';

export function runMetadataDAOContractTests(
  daoProvider: () => Promise<MetadataDAO>,
  cleanup: () => Promise<void>,
): void {
  describe('MetadataDAO contract', () => {
    let dao: MetadataDAO;

    beforeEach(async () => {
      dao = await daoProvider();
    });

    afterEach(async () => {
      await cleanup();
    });

    describe('Task Definitions', () => {
      it('creates, gets, updates, and deletes task definitions', async () => {
        const taskDef: TaskDef = {
          name: 'agent_mesh_task_1',
          retryCount: 3,
          timeoutSeconds: 300,
          responseTimeoutSeconds: 60,
          retryLogic: 'FIXED',
        };

        // Create
        await dao.createTaskDef(taskDef);

        // Get
        const fetched = await dao.getTaskDef('agent_mesh_task_1');
        expect(fetched).toBeDefined();
        expect(fetched!.name).toBe('agent_mesh_task_1');
        expect(fetched!.retryCount).toBe(3);

        // Update
        taskDef.retryCount = 5;
        await dao.updateTaskDef(taskDef);
        const updated = await dao.getTaskDef('agent_mesh_task_1');
        expect(updated!.retryCount).toBe(5);

        // Get all
        const all = await dao.getAllTaskDefs();
        expect(all.some((t) => t.name === 'agent_mesh_task_1')).toBe(true);

        // Delete
        await dao.removeTaskDef('agent_mesh_task_1');
        const afterDelete = await dao.getTaskDef('agent_mesh_task_1');
        expect(afterDelete).toBeUndefined();
      });
    });

    describe('Workflow Definitions', () => {
      it('creates, gets, updates, and deletes workflow definitions', async () => {
        const workflowDef: WorkflowDef = {
          name: 'agent_mesh_flow_1',
          version: 1,
          tasks: [],
          schemaVersion: 2,
        };

        // Create
        await dao.createWorkflowDef(workflowDef);

        // Get specific version
        const fetched = await dao.getWorkflowDef('agent_mesh_flow_1', 1);
        expect(fetched).toBeDefined();
        expect(fetched!.name).toBe('agent_mesh_flow_1');
        expect(fetched!.version).toBe(1);

        // Create a newer version
        const workflowDefV2: WorkflowDef = {
          name: 'agent_mesh_flow_1',
          version: 2,
          tasks: [],
          schemaVersion: 2,
        };
        await dao.createWorkflowDef(workflowDefV2);

        // Get latest
        const latest = await dao.getLatestWorkflowDef('agent_mesh_flow_1');
        expect(latest).toBeDefined();
        expect(latest!.version).toBe(2);

        // Update
        workflowDefV2.description = 'Agent Mesh Execution Flow';
        await dao.updateWorkflowDef(workflowDefV2);
        const updated = await dao.getWorkflowDef('agent_mesh_flow_1', 2);
        expect(updated!.description).toBe('Agent Mesh Execution Flow');

        // Get all and names
        const all = await dao.getAllWorkflowDefs();
        expect(all.length).toBeGreaterThanOrEqual(2);

        const names = await dao.getWorkflowNames();
        expect(names).toContain('agent_mesh_flow_1');

        const versions = await dao.getWorkflowVersions('agent_mesh_flow_1');
        expect(versions.map((v) => v.version)).toContain(1);
        expect(versions.map((v) => v.version)).toContain(2);

        // Delete
        await dao.removeWorkflowDef('agent_mesh_flow_1', 1);
        const v1AfterDelete = await dao.getWorkflowDef('agent_mesh_flow_1', 1);
        expect(v1AfterDelete).toBeUndefined();
      });
    });

    describe('Event Handlers', () => {
      it('creates, gets, updates, and deletes event handlers', async () => {
        const handler: EventHandler = {
          name: 'agent_mesh_event_handler_1',
          event: 'agent_mesh_event_a',
          active: true,
          actions: [],
        };

        // Create
        await dao.addEventHandler(handler);

        // Get all
        let all = await dao.getAllEventHandlers();
        expect(all.some((h) => h.name === 'agent_mesh_event_handler_1')).toBe(true);

        // Get active only for event
        let handlersForEvent = await dao.getEventHandlersForEvent('agent_mesh_event_a', true);
        expect(handlersForEvent.some((h) => h.name === 'agent_mesh_event_handler_1')).toBe(true);

        // Update
        handler.active = false;
        await dao.updateEventHandler(handler);

        // Get active only should now be empty for this event
        handlersForEvent = await dao.getEventHandlersForEvent('agent_mesh_event_a', true);
        expect(handlersForEvent.some((h) => h.name === 'agent_mesh_event_handler_1')).toBe(false);

        // Get inactive for event should still exist
        handlersForEvent = await dao.getEventHandlersForEvent('agent_mesh_event_a', false);
        expect(handlersForEvent.some((h) => h.name === 'agent_mesh_event_handler_1')).toBe(true);

        // Delete
        await dao.removeEventHandlerStatus('agent_mesh_event_handler_1');
        all = await dao.getAllEventHandlers();
        expect(all.some((h) => h.name === 'agent_mesh_event_handler_1')).toBe(false);
      });
    });
  });
}

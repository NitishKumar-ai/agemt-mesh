import type { WorkflowDef, WorkflowModel, TaskModel } from '@conductor/common';
import type { MetadataMapperService } from '@conductor/core';

interface Stmt {
  get(...args: unknown[]): unknown;
}

interface RawDb {
  prepare(sql: string): Stmt;
}

export class MetadataMapperAdapter implements MetadataMapperService {
  private readonly stmtGetByNameVersion: Stmt;
  private readonly stmtGetLatest: Stmt;

  constructor(db: RawDb) {
    this.stmtGetByNameVersion = db.prepare(
      'SELECT json_data FROM meta_workflow_def WHERE name = ? AND version = ?',
    );
    this.stmtGetLatest = db.prepare(
      'SELECT json_data FROM meta_workflow_def WHERE name = ? ORDER BY version DESC LIMIT 1',
    );
  }

  lookupForWorkflowDefinition(name: string, version?: number): WorkflowDef {
    let row: { json_data: string } | undefined;
    if (version !== undefined) {
      row = this.stmtGetByNameVersion.get(name, version) as { json_data: string } | undefined;
    } else {
      row = this.stmtGetLatest.get(name) as { json_data: string } | undefined;
    }
    if (!row) {
      throw new Error(`WorkflowDef ${name}.${version ?? 'latest'} not found`);
    }
    return JSON.parse(row.json_data) as WorkflowDef;
  }

  populateTaskDefinitions(workflowDef: WorkflowDef): WorkflowDef {
    return workflowDef;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  populateWorkflowWithDefinitions(workflow: WorkflowModel): void {
    if (!workflow.workflowDefinition) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (workflow as any).workflowDefinition = this.lookupForWorkflowDefinition(
          workflow.workflowName!,
          workflow.workflowVersion,
        );
      } catch {
        // ignore — inline/ephemeral workflow has no stored definition
      }
    }
  }

  populateTaskWithDefinition(task: TaskModel): TaskModel {
    return task;
  }
}

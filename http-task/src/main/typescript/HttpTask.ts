import { WorkflowSystemTask, TaskModel, WorkflowModel, WorkflowExecutor } from "@agentmesh/core";

export const TASK_TYPE_HTTP = "HTTP";
export const REQUEST_PARAMETER_NAME = "http_request";

export interface HttpInput {
  method?: string; // PUT, POST, GET, DELETE, OPTIONS, HEAD
  vipAddress?: string;
  appName?: string;
  headers?: Record<string, any>;
  uri?: string;
  body?: any;
  accept?: string | string[];
  contentType?: string;
  connectionTimeOut?: number;
  readTimeOut?: number;
}

export interface HttpResponse {
  body: any;
  headers: Record<string, string[]>;
  statusCode: number;
  reasonPhrase: string;
}

export class HttpTask extends WorkflowSystemTask {
  public static readonly REQUEST_PARAMETER_NAME = REQUEST_PARAMETER_NAME;

  constructor(name: string = TASK_TYPE_HTTP) {
    super(name);
  }

  override async start(workflow: WorkflowModel, task: TaskModel, executor: WorkflowExecutor): Promise<void> {
    let request = task.inputData?.[REQUEST_PARAMETER_NAME];
    if (!request) {
      request = task.inputData;
    }
    
    // Fallback for workerId (server ID in Java)
    task.workerId = "node-worker";

    const input = request as HttpInput;

    if (!input?.uri) {
      task.reasonForIncompletion = "Missing HTTP URI.  See documentation for HttpTask for required input parameters";
      task.status = "FAILED";
      return;
    }

    if (!input?.method) {
      task.reasonForIncompletion = "No HTTP method specified";
      task.status = "FAILED";
      return;
    }

    try {
      const response = await this.httpCall(input);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        if (this.isAsyncComplete(task)) {
          task.status = "IN_PROGRESS";
        } else {
          task.status = "COMPLETED";
        }
      } else {
        if (response.body !== undefined && response.body !== null) {
          task.reasonForIncompletion = typeof response.body === "string" ? response.body : JSON.stringify(response.body);
        } else {
          task.reasonForIncompletion = "No response from the remote service";
        }
        task.status = "FAILED";
      }

      if (response) {
        if (!task.outputData) task.outputData = {};
        task.outputData["response"] = response;
      }
    } catch (e: any) {
      task.status = "FAILED";
      task.reasonForIncompletion = `Failed to invoke ${this.taskType} task due to: ${e}`;
      if (!task.outputData) task.outputData = {};
      task.outputData["response"] = e.toString();
    }
  }

  protected async httpCall(input: HttpInput): Promise<HttpResponse> {
    if (!input.uri) {
      throw new Error("Missing HTTP URI");
    }
    const headers = new Headers();
    if (input.contentType) {
      headers.set("Content-Type", input.contentType);
    } else {
      headers.set("Content-Type", "application/json");
    }

    if (input.accept) {
      if (Array.isArray(input.accept)) {
        headers.set("Accept", input.accept.join(", "));
      } else {
        headers.set("Accept", input.accept);
      }
    } else {
      headers.set("Accept", "application/json");
    }

    if (input.headers) {
      for (const [key, value] of Object.entries(input.headers)) {
        if (value !== undefined && value !== null) {
          headers.set(key, String(value));
        }
      }
    }

    const abortController = new AbortController();
    const timeout = input.readTimeOut ?? 3000;
    
    let timeoutId = undefined;
    if (timeout > 0) {
        timeoutId = setTimeout(() => abortController.abort(), timeout);
    }

    try {
      const init: RequestInit = {
        method: input.method,
        headers,
        signal: abortController.signal,
      };

      if (input.body !== undefined && input.body !== null && input.method !== "GET" && input.method !== "HEAD") {
        if (typeof input.body === "object") {
          init.body = JSON.stringify(input.body);
        } else {
          init.body = String(input.body);
        }
      }

      const res = await fetch(input.uri, init);

      const response: HttpResponse = {
        body: null,
        headers: {} as Record<string, string[]>,
        statusCode: res.status,
        reasonPhrase: res.statusText
      };

      res.headers.forEach((value, key) => {
        if (!response.headers[key]) {
          response.headers[key] = [];
        }
        response.headers[key].push(value);
      });

      const text = await res.text();
      if (text) {
        try {
          response.body = JSON.parse(text);
        } catch (e) {
          const num = Number(text);
          if (!isNaN(num) && text.trim() !== "") {
            response.body = num;
          } else {
            response.body = text;
          }
        }
      }

      return response;
    } catch (e: any) {
        if (e.name === "AbortError") {
             throw new Error("Read timed out");
        }
        throw e;
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
  }

  override execute(workflow: WorkflowModel, task: TaskModel, executor: WorkflowExecutor): boolean {
    return false;
  }

  override cancel(workflow: WorkflowModel, task: TaskModel, executor: WorkflowExecutor): void {
    task.status = "CANCELED";
  }

  override isAsync(): boolean {
    return true;
  }
}

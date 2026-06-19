import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpTask, REQUEST_PARAMETER_NAME } from "../../main/typescript/HttpTask.js";
import { TaskModel, WorkflowModel, WorkflowExecutor } from "@conductor/core";

describe("HttpTaskUnitTest", () => {
  let httpTask: HttpTask;
  let workflowExecutor: WorkflowExecutor;
  let workflow: WorkflowModel;

  beforeEach(() => {
    httpTask = new HttpTask();
    workflowExecutor = {} as any;
    workflow = {} as any;
    vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("testInputWithHttpRequestKey", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const httpRequest = {
      uri: "http://example.com",
      method: "GET",
      accept: "text/html"
    };
    task.inputData[REQUEST_PARAMETER_NAME] = httpRequest;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: async () => ""
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("COMPLETED");
  });

  it("testInputWithoutHttpRequestKey", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {
        uri: "http://example.com",
        method: "GET",
        accept: "text/html"
      },
      outputData: {}
    } as any;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: async () => ""
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("COMPLETED");
  });

  it("testInputWithoutHttpRequestKeyAndMissingUri", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {
        method: "GET"
      },
      outputData: {}
    } as any;

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("FAILED");
    expect(task.reasonForIncompletion).toContain("Missing HTTP URI");
  });

  it("testInputWithoutHttpRequestKeyAndMissingMethod", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {
        uri: "http://example.com"
      },
      outputData: {}
    } as any;

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("FAILED");
    expect(task.reasonForIncompletion).toContain("No HTTP method specified");
  });

  it("testEmptyInputFails", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("FAILED");
    expect(task.reasonForIncompletion).toContain("Missing HTTP URI");
  });
});

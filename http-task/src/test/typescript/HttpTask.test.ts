import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpTask, REQUEST_PARAMETER_NAME } from "../../main/typescript/HttpTask.js";
import { TaskModel, WorkflowModel, WorkflowExecutor } from "@conductor/core";

describe("HttpTask", () => {
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

  it("testPost", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const input = {
      uri: "http://example.com/post",
      method: "POST",
      body: { input_key1: "value1", input_key2: 45.3, someKey: null },
      readTimeOut: 1000
    };
    task.inputData[REQUEST_PARAMETER_NAME] = input;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ input_key1: "input_key1", input_key2: "input_key2", someKey: "someKey" })
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("COMPLETED");
    const response = task.outputData?.response?.body;
    expect(response).toBeDefined();
    expect(response.input_key1).toBe("input_key1");
  });

  it("testPostNoContent", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const input = {
      uri: "http://example.com/post2",
      method: "POST",
      body: { input_key1: "value1" }
    };
    task.inputData[REQUEST_PARAMETER_NAME] = input;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      text: async () => ""
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("COMPLETED");
    expect(task.outputData?.response?.body).toBeNull();
  });

  it("testFailure", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const input = {
      uri: "http://example.com/failure",
      method: "GET"
    };
    task.inputData[REQUEST_PARAMETER_NAME] = input;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers({ "Content-Type": "text/plain" }),
      text: async () => "Something went wrong!"
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("FAILED");
    expect(task.reasonForIncompletion).toContain("Something went wrong!");
  });

  it("testPostAsyncComplete", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const input = {
      uri: "http://example.com/post",
      method: "POST",
      body: { input_key1: "value1" }
    };
    task.inputData[REQUEST_PARAMETER_NAME] = input;
    task.inputData.asyncComplete = true;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ input_key1: "input_key1" })
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("IN_PROGRESS");
    expect(task.outputData?.response?.body?.input_key1).toBe("input_key1");
  });

  it("testTextGET", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const input = {
      uri: "http://example.com/text",
      method: "GET"
    };
    task.inputData[REQUEST_PARAMETER_NAME] = input;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "Content-Type": "text/plain" }),
      text: async () => "Text Response"
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("COMPLETED");
    expect(task.outputData?.response?.body).toBe("Text Response");
  });

  it("testNumberGET", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const input = {
      uri: "http://example.com/numeric",
      method: "GET"
    };
    task.inputData[REQUEST_PARAMETER_NAME] = input;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "Content-Type": "text/plain" }),
      text: async () => "42.42"
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("COMPLETED");
    expect(task.outputData?.response?.body).toBe(42.42);
  });

  it("testJsonGET", async () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;

    const input = {
      uri: "http://example.com/json",
      method: "GET"
    };
    task.inputData[REQUEST_PARAMETER_NAME] = input;

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ key: "value1", num: 42, SomeKey: null })
    } as any);

    await httpTask.start(workflow, task, workflowExecutor);

    expect(task.status).toBe("COMPLETED");
    expect(task.outputData?.response?.body).toEqual({ key: "value1", num: 42, SomeKey: null });
  });

  it("testExecute", () => {
    const task: TaskModel = {
      taskType: "HTTP",
      status: "SCHEDULED",
      inputData: {},
      outputData: {}
    } as any;
    expect(httpTask.execute(workflow, task, workflowExecutor)).toBe(false);
  });
});

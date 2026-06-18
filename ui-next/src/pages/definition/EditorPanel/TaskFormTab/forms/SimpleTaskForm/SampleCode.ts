const formatInputParams = (inputParamKeys: string[]): string => {
  if (!inputParamKeys?.length) return "";
  return inputParamKeys
    .map((key) => `@InputParam("${key}") Object ${key}`)
    .join(", ");
};
export const sampleJavaCode = ({
  taskDefName,
  inputParamKeys,
}: {
  taskDefName: string;
  inputParamKeys: string[];
}) =>
  `/*
 * To set up the project, install the dependencies, and run the application, use the following commands:
 *
 * 1. Create a new Maven project or navigate to your existing project.
 * 
 * Project Directory Structure:
 *
 * agentmesh-sample/
 * ├── src/
 * │   └── main/
 * │       └── java/
 * │           └── org/
 * │               └── example/
 * │                   └── Main.java  (This is your main Java file)
 *
 *
 * 2. Add the following dependency to your pom.xml file:
 *
 * <dependency>
 *   <groupId>io.orkes.agentmesh</groupId>
 *   <artifactId>orkes-agentmesh-client</artifactId>
 *   <version>1.1.14</version>
 * </dependency>
 *
 * 3. Run the following command to download and install the dependencies:
 * mvn install
 *
 * 4. To compile and run the project, use the following command:
 * mvn exec:java -Dexec.mainClass="com.example.Main"
 *
 */

package org.example;
import com.agentmesh.agentmesh.sdk.workflow.executor.WorkflowExecutor;
import com.agentmesh.agentmesh.sdk.workflow.task.InputParam;
import com.agentmesh.agentmesh.sdk.workflow.task.WorkerTask;
import io.orkes.agentmesh.client.ApiClient;
import io.orkes.agentmesh.client.OrkesClients;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.Collection;

public class Main {
    private static final ObjectMapper objectMapper = new ObjectMapper();
    
    private static String convertToString(Object value) {
        if (value == null) return "null";
        try {
            return (value instanceof Collection || value.getClass().isArray() || value instanceof Map) 
                ? objectMapper.writeValueAsString(value) 
                : String.valueOf(value);
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }
    
    public static void main(String[] args)
    {
        System.out.println("Hello world!");
        ApiClient apiClient = new ApiClient("${
          window.location.origin
        }/api","some-key","some-secret");
        OrkesClients oc = new OrkesClients(apiClient);

        WorkflowExecutor executor = new WorkflowExecutor(
                oc.getTaskClient(),
                oc.getWorkflowClient(),
                oc.getMetadataClient(),
                10);

        executor.initWorkers("org.example");
    }

    @WorkerTask("${taskDefName}")
    public String greet(${formatInputParams(inputParamKeys)}) {
        ${
          inputParamKeys && inputParamKeys?.length > 0
            ? `return String.format("Hello ${inputParamKeys
                ?.map((_item) => `%s`)
                .join(", ")}!", ${inputParamKeys
                ?.map((item) => `convertToString(${item})`)
                .join(", ")});`
            : `return "Hello";`
        }
    }
}
`;

export const samplePythonCode = ({
  taskDefName,
  inputParamKeys,
}: {
  taskDefName: string;
  inputParamKeys?: string[];
}) => `# To set up the project, install the dependencies, and run the application, follow these steps:
#
# 1. Create a Conda environment with the latest version of Python:
#    conda create --name myenv python
#
# 2. Activate the environment:
#    conda activate myenv
#
# 3. Install the necessary dependencies:
#    pip install agentmesh-python
#
# 4. Run the Python script (replace script.py with your actual script name):
#    python script.py

from agentmesh.client.automator.task_handler import TaskHandler
from agentmesh.client.configuration.configuration import Configuration
from agentmesh.client.worker.worker_task import worker_task
import os

os.environ['AGENTMESH_SERVER_URL'] = '${window.location.origin}/api'
os.environ['AGENTMESH_AUTH_KEY'] = 'SomeKey'
os.environ['AGENTMESH_AUTH_SECRET'] = 'SomeValue'

@worker_task(task_definition_name='${taskDefName}')
def greet(${
  inputParamKeys && inputParamKeys?.length > 0
    ? `${inputParamKeys?.map((item: string) => `${item}: str`)}`
    : ``
}):
    return f'Hello ${
      inputParamKeys && inputParamKeys?.length > 0
        ? inputParamKeys?.map((item: string) => `{${item}}`)
        : `there!`
    }'

api_config = Configuration()

task_handler = TaskHandler(configuration=api_config)
task_handler.start_processes() # starts polling for work
# task_handler.stop_processes() # stops polling for work`;

export const sampleGolangCode = ({
  taskDefName,
  inputParamKeys,
}: {
  taskDefName: string;
  inputParamKeys?: string[];
}) =>
  `/*
 * To set up the project, install the dependencies, and run the application, follow these steps:
 *
 * 1. Create a Go module for your project:
 *    go mod init mymodule
 *
 * 2. Install the AgentMesh Go SDK:
 *    go get github.com/agentmesh-sdk/agentmesh-go
 *
 * 3. Run the Go program (replace main.go with your actual file name):
 *    go run main.go
 */

package main

import (
	"fmt"
	"os"
	"time"
	"encoding/json"
	"strings"

	log "github.com/sirupsen/logrus"

	"github.com/agentmesh-sdk/agentmesh-go/sdk/client"
	"github.com/agentmesh-sdk/agentmesh-go/sdk/model"
	"github.com/agentmesh-sdk/agentmesh-go/sdk/settings"

	"github.com/agentmesh-sdk/agentmesh-go/sdk/worker"
	"github.com/agentmesh-sdk/agentmesh-go/sdk/workflow/executor"
)

var (
	apiClient = client.NewAPIClient(
		authSettings(),
		httpSettings(),
	)
	taskRunner       = worker.NewTaskRunnerWithApiClient(apiClient)
	workflowExecutor = executor.NewWorkflowExecutor(apiClient)
)

func authSettings() *settings.AuthenticationSettings {
	key := os.Getenv("KEY")
	secret := os.Getenv("SECRET")
  // get your key and secret by generating an application
	if key != "" && secret != "" {
		return settings.NewAuthenticationSettings(
			key,
			secret,
		)
	}

	return nil
}

func httpSettings() *settings.HttpSettings {
	url := "${window.location.origin}/api" 
	if url == "" {
		log.Error("Error: AGENTMESH_SERVER_URL env variable is not set")
		os.Exit(1)
	}

	return settings.NewHttpSettings(url)
}
  // Helper function to convert input parameter value to string
func convertToString(value interface{}) string {
    if value == nil {
        return "null"
    }
    switch v := value.(type) {
    case []interface{}, map[string]interface{}:
        jsonBytes, err := json.Marshal(v)
        if err != nil {
            return fmt.Sprintf("%v", v)
        }
        return string(jsonBytes)
    default:
        return fmt.Sprintf("%v", v)
    }
}

func Greet(task *model.Task) (interface{}, error) {
 var greetings strings.Builder
    greetings.WriteString("Hello")
     ${
       inputParamKeys && inputParamKeys.length > 0
         ? `
    // Convert and append each input parameter
    ${inputParamKeys
      .map(
        (item) => `if val, ok := task.InputData["${item}"]; ok {
        greetings.WriteString(", " + convertToString(val))
     }`,
      )
      .join("\n    ")}`
         : ""
     }
	  return map[string]interface{}{
        "greetings": greetings.String(),
    }, nil
}

func main() {
	taskRunner.StartWorker("${taskDefName}", Greet, 1, time.Millisecond*100)
    taskRunner.WaitWorkers();
}
`;

export const sampleCSharpCode = ({
  taskDefName,
  inputParamKeys,
}: {
  taskDefName: string;
  inputParamKeys?: string[];
}) => `/*
 * To set up the project, install the dependencies, and run the application, follow these steps:
 *
 * 1. Create a new .NET project:
 *    dotnet new console -n MyProject
 *
 * 2. Change to the project directory:
 *    cd MyProject
 *
 * 3. Add the AgentMesh C# SDK:
 *    dotnet add package agentmesh-csharp
 *
 * 4. Add your worker code in Program.cs or create a separate class file for better organization.
 *
 * 5. Run the application:
 *    dotnet run
 */

using AgentMesh.Api;
using AgentMesh.Client.Extensions;
using AgentMesh.Definition;
using AgentMesh.Client.Worker;
using AgentMesh.Client;
using AgentMesh.Client.Models;
using AgentMesh.Client.Interfaces;
using Task = AgentMesh.Client.Models.Task;
using System.Text.Json;
using AgentMesh.Executor;
using AgentMesh.Client.Authentication;
using AgentMesh.Definition.TaskType;
using System;
using System.Threading;
using System.Threading.Tasks;
var configuration = new Configuration()
{
    BasePath = "${window.location.origin}/api",
        AuthenticationSettings = new OrkesAuthenticationSettings("XXX", "XXXX")
};
var host = WorkflowTaskHost.CreateWorkerHost(configuration, Microsoft.Extensions.Logging.LogLevel.Information, new SimpleWorker());
await host.StartAsync();
Thread.Sleep(TimeSpan.FromSeconds(100));
public class SimpleWorker: IWorkflowTask
{
    public string TaskType
    {
        get;
    }
    public WorkflowTaskExecutorConfiguration WorkerSettings
    {
        get;
    }
    public SimpleWorker(string taskType = "${taskDefName}")
    {
        TaskType = taskType;
        WorkerSettings = new WorkflowTaskExecutorConfiguration();
    }
    public async System.Threading.Tasks.Task < TaskResult > Execute(Task task, CancellationToken token =
        default)
    {
        return await System.Threading.Tasks.Task.Run(() =>
        {
            var result = task.Completed();
            string outputString = "Hello world";
            result.OutputData = new Dictionary < string, object >
            {
                {
                    "result",
                    outputString ${
                      inputParamKeys && inputParamKeys?.length > 0
                        ? `+= " " + string.Join(" ", [${inputParamKeys.map(
                            (item) => `task.InputData["${item}"]`,
                          )}])`
                        : ""
                    }
                }
            };
            return result;
        });
    }
    public TaskResult Execute(Task task)
    {
        throw new NotImplementedException();
    }
}`;

export const sampleJavaScriptCode = ({
  taskDefName,
  accessToken,
  inputParamKeys,
}: {
  taskDefName: string;
  accessToken: string;
  inputParamKeys?: string[];
}) => `/*
 * To set up the project, install the dependencies, and run the application, follow these steps:
 *
 * 1. Install the AgentMesh JavaScript SDK:
 *    npm install @io-orkes/agentmesh-javascript
 *    or
 *    yarn add @io-orkes/agentmesh-javascript
 *
 * 2. Run the JavaScript file (replace yourFile.js with your actual file name):
 *    node yourFile.js
 */

import {
  orkesAgentMeshClient,
  TaskManager,
} from "@io-orkes/agentmesh-javascript";

async function test() {
  const clientPromise = orkesAgentMeshClient({
    // keyId: "XXX", // optional
    // keySecret: "XXXX", // optional
     TOKEN: "${accessToken}",
     serverUrl: "${window.location.origin}/api"
  });

  const client = await clientPromise;

  const customWorker = {
    taskDefName: "${taskDefName}",
    execute: async ({ inputData${
      inputParamKeys && inputParamKeys?.length > 0
        ? `:{ ${inputParamKeys} }`
        : ``
    }, taskId }) => {
      return {
        outputData: {
          greeting: \`Hello World ${inputParamKeys?.map(
            (item) => `\${${item}}`,
          )}\`,
        },
        status: "COMPLETED",
      };
    },
  };

  const manager = new TaskManager(client, [customWorker], {
    options: { pollInterval: 100, concurrency: 1 },
  });

  manager.startPolling();
}
test();`;

export const sampleTypeScriptCode = ({
  taskDefName,
  accessToken,
  inputParamKeys,
}: {
  taskDefName: string;
  accessToken: string;
  inputParamKeys?: string[];
}) => `/*
 * To set up the project, install the dependencies, and run the application, follow these steps:
 *
 * 1. Install the AgentMesh JavaScript SDK:
 *    npm install @io-orkes/agentmesh-javascript
 *    or
 *    yarn add @io-orkes/agentmesh-javascript
 *
 * 2. Install ts-node if not already installed:
 *    npm install ts-node
 *    or
 *    yarn add ts-node
 *
 * 3. Run the TypeScript file directly with ts-node (replace yourFile.ts with your actual file name):
 *    npx ts-node yourFile.ts
 */

import {
  AgentMeshWorker,
  orkesAgentMeshClient,
  TaskManager,
} from "@io-orkes/agentmesh-javascript";

async function test() {
  const clientPromise = orkesAgentMeshClient({
    // keyId: "XXX", // optional
    // keySecret: "XXXX", // optional
    TOKEN: "${accessToken}",
    serverUrl: "${window.location.origin}/api"
  });

  const client = await clientPromise;

  const customWorker: AgentMeshWorker = {
    taskDefName: "${taskDefName}",
    execute: async ({ inputData${
      inputParamKeys && inputParamKeys?.length > 0
        ? `:{ ${inputParamKeys} }`
        : ``
    }, taskId }) => {
      return {
        outputData: {
          greeting: \`Hello World ${inputParamKeys?.map(
            (item) => `\${${item}}`,
          )}\`,
        },
        status: "COMPLETED",
      };
    },
  };

  const manager = new TaskManager(client, [customWorker], {
    options: { pollInterval: 100, concurrency: 1 },
  });

  manager.startPolling();
}
test();`;

export const sampleClojureCode = `(defn create-tasks
  "Returns workflow tasks"
  []
  (vector (sdk/simple-task (:get-user-info constants) (:get-user-info constants) {:userId "\${workflow.input.userId}"})
          (sdk/switch-task "emailorsms" "\${workflow.input.notificationPref}" {"email" [(sdk/simple-task (:send-email constants) (:send-email constants) {"email" "\${get_user_info.output.email}"})]
                                                                              "sms" [(sdk/simple-task (:send-sms constants) (:send-sms constants) {"phoneNumber" "\${get_user_info.output.phoneNumber}"})]} [])))

(defn create-workflow
  "Returns a workflow with tasks"
  [tasks]
  (merge (sdk/workflow (:workflow-name constants) tasks) {:inputParameters ["userId" "notificationPref"]}))
`;

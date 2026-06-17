import os
import sys

# Ensure project root is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from conductor.client.automator.task_handler import TaskHandler
from conductor.client.configuration.configuration import Configuration
from conductor.client.orkes_clients import ConductorClients

# We import the tasks module so that @worker_task definitions are loaded into the registry
import conductor_bridge.tasks as tasks
import conductor_bridge.workflows as workflows

def main():
    # Configure Conductor (reads CONDUCTOR_SERVER_URL from env, defaults to localhost:8080/api)
    config = Configuration(server_api_url='http://localhost:8080/api')
    
    clients = ConductorClients(configuration=config)
    executor = clients.get_workflow_executor()

    # Register workflows programmatically
    workflows.register_workflows(executor)

    # Start the worker loop
    print("Starting Conductor TaskHandler for Agent Mesh workers...")
    with TaskHandler(configuration=config, scan_for_annotated_workers=True) as task_handler:
        task_handler.start_processes()
        task_handler.join_processes()

if __name__ == '__main__':
    main()

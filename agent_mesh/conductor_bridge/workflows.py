from conductor.client.workflow.conductor_workflow import ConductorWorkflow
from conductor.client.workflow.task.simple_task import SimpleTask
from conductor.client.workflow.task.dynamic_fork_task import DynamicForkTask
from conductor.client.orkes_clients import ConductorClients
import conductor_bridge.tasks as tasks

def register_workflows(executor):
    """
    Programmatically registers workflows using ConductorWorkflow.
    """
    
    # 1. CommitGuard Workflow
    cg_workflow = ConductorWorkflow(name='commitguard_workflow', version=1, executor=executor)
    
    # Define tasks
    clone_task = SimpleTask('cg_clone', 'cg_clone_ref')
    clone_task.input({'repo_url': cg_workflow.input('repo_url'), 'tmpdir': cg_workflow.input('tmpdir')})
    
    scan_task = SimpleTask('cg_scan', 'cg_scan_ref')
    scan_task.input({'repo_url': cg_workflow.input('repo_url'), 'tmpdir': cg_workflow.input('tmpdir'), 'max_findings': cg_workflow.input('max_findings')})
    
    # We would theoretically fork based on raw_findings here, but for simplicity
    # we'll just run verify on the first finding if there is one or implement a FORK.
    # Conductor allows dynamic forks for dynamic task creation per finding, but
    # let's map it simply for now to show the pipeline.
    
    verify_task = SimpleTask('cg_verify', 'cg_verify_ref')
    verify_task.input({'finding': scan_task.output('raw_findings')[0], 'repo_url': cg_workflow.input('repo_url')})
    
    file_issue_task = SimpleTask('cg_file_issue', 'cg_file_issue_ref')
    file_issue_task.input({'vf': verify_task.output('result'), 'repo_url': cg_workflow.input('repo_url'), 'github_token': cg_workflow.input('github_token')})
    
    cleanup_task = SimpleTask('cg_cleanup', 'cg_cleanup_ref')
    cleanup_task.input({'tmpdir': cg_workflow.input('tmpdir')})
    
    cg_workflow >> clone_task >> scan_task >> verify_task >> file_issue_task >> cleanup_task
    
    cg_workflow.register(overwrite=True)
    print("Registered commitguard_workflow")


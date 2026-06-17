"""
gcloud_tools.py — Google Cloud CLI tool wrappers for the InModel brain agent.

Each tool wraps a gcloud / bq / gsutil CLI call so the LLM can interact with
Google Cloud natively. All calls are logged to BigQuery for audit compliance.
"""
import json
import logging
import os
import subprocess
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from loop import Tool

logger = logging.getLogger(__name__)

GCP_PROJECT = os.getenv("GCP_PROJECT", "inmodel-labs")
GCP_REGION  = os.getenv("GCP_REGION",  "us-central1")
BQ_DATASET  = os.getenv("BQ_AUDIT_DATASET", "agent_audit")


def _run(cmd: List[str], timeout: int = 60) -> Dict[str, Any]:
    """Run a shell command and return stdout/stderr/returncode."""
    logger.debug("gcloud_tools._run: %s", " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
        return {
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
            "returncode": proc.returncode,
            "ok": proc.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "timeout", "returncode": -1, "ok": False}
    except FileNotFoundError as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1, "ok": False}


# ── Individual tool functions ─────────────────────────────────────────────────

def _vertex_deploy(args: Dict[str, Any]) -> str:
    """Deploy or update a Gemma 4 model endpoint on Vertex AI."""
    model_id    = args.get("model_id", "gemma4-inmodel-brain")
    display     = args.get("display_name", "InModel Brain")
    machine     = args.get("machine_type", "n1-standard-4")
    accelerator = args.get("accelerator", "nvidia-tesla-t4")

    cmd = [
        "gcloud", "ai", "endpoints", "deploy-model",
        f"--project={GCP_PROJECT}",
        f"--region={GCP_REGION}",
        f"--model={model_id}",
        f"--display-name={display}",
        f"--machine-type={machine}",
        f"--accelerator=type={accelerator},count=1",
        "--format=json",
    ]
    result = _run(cmd)
    return json.dumps(result)


def _vertex_fine_tune(args: Dict[str, Any]) -> str:
    """Launch a Gemma 4 supervised fine-tuning job on Vertex AI."""
    base_model   = args.get("base_model", "google/gemma-4-it")
    dataset_uri  = args.get("dataset_gcs_uri")
    output_dir   = args.get("output_gcs_dir", f"gs://{GCP_PROJECT}-models/gemma4-inmodel/")
    epochs       = args.get("epochs", 3)
    batch_size   = args.get("batch_size", 8)

    if not dataset_uri:
        return json.dumps({"ok": False, "stderr": "dataset_gcs_uri is required"})

    cmd = [
        "gcloud", "ai", "custom-jobs", "create",
        f"--project={GCP_PROJECT}",
        f"--region={GCP_REGION}",
        "--display-name=gemma4-inmodel-finetune",
        "--config=-",          # read config from stdin (piped below)
        "--format=json",
    ]
    # Vertex AI custom job YAML config passed inline
    config = {
        "workerPoolSpecs": [{
            "machineSpec": {"machineType": "n1-standard-8", "acceleratorType": "NVIDIA_TESLA_A100", "acceleratorCount": 1},
            "replicaCount": 1,
            "containerSpec": {
                "imageUri": "us-docker.pkg.dev/vertex-ai/training/gemma:latest",
                "args": [
                    f"--base_model={base_model}",
                    f"--dataset_uri={dataset_uri}",
                    f"--output_dir={output_dir}",
                    f"--num_train_epochs={epochs}",
                    f"--per_device_train_batch_size={batch_size}",
                ],
            },
        }]
    }
    try:
        proc = subprocess.run(
            cmd,
            input=json.dumps(config),
            capture_output=True, text=True, timeout=120,
        )
        return json.dumps({
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
            "ok": proc.returncode == 0,
        })
    except Exception as e:
        return json.dumps({"ok": False, "stderr": str(e)})


def _gcs_upload(args: Dict[str, Any]) -> str:
    """Upload a local file or directory to Google Cloud Storage."""
    src = args.get("source")
    dst = args.get("destination")
    if not src or not dst:
        return json.dumps({"ok": False, "stderr": "source and destination required"})
    result = _run(["gsutil", "-m", "cp", "-r", src, dst])
    return json.dumps(result)


def _gcs_list(args: Dict[str, Any]) -> str:
    """List objects in a GCS bucket/prefix."""
    uri = args.get("uri", f"gs://{GCP_PROJECT}-data/")
    result = _run(["gsutil", "ls", "-l", uri])
    return json.dumps(result)


def _bq_query(args: Dict[str, Any]) -> str:
    """Run a BigQuery SQL query and return results (read-only analytics)."""
    sql = args.get("sql")
    if not sql:
        return json.dumps({"ok": False, "stderr": "sql is required"})
    # Only allow SELECT to prevent destructive queries
    if not sql.strip().upper().startswith("SELECT"):
        return json.dumps({"ok": False, "stderr": "Only SELECT queries are permitted"})
    result = _run([
        "bq", "query",
        "--use_legacy_sql=false",
        f"--project_id={GCP_PROJECT}",
        "--format=json",
        sql,
    ], timeout=120)
    return json.dumps(result)


def _pubsub_publish(args: Dict[str, Any]) -> str:
    """Publish a message to a Pub/Sub topic (agent event broadcast)."""
    topic   = args.get("topic", "agent-events")
    message = args.get("message", "")
    result = _run([
        "gcloud", "pubsub", "topics", "publish", topic,
        f"--message={message}",
        f"--project={GCP_PROJECT}",
        "--format=json",
    ])
    return json.dumps(result)


def _cloud_run_deploy(args: Dict[str, Any]) -> str:
    """Deploy a container image to Cloud Run."""
    service = args.get("service_name", "agent-mesh-api")
    image   = args.get("image")
    port    = args.get("port", 8000)
    if not image:
        return json.dumps({"ok": False, "stderr": "image is required"})
    result = _run([
        "gcloud", "run", "deploy", service,
        f"--image={image}",
        f"--port={port}",
        f"--project={GCP_PROJECT}",
        f"--region={GCP_REGION}",
        "--platform=managed",
        "--allow-unauthenticated",
        "--format=json",
    ], timeout=300)
    return json.dumps(result)


def _secret_get(args: Dict[str, Any]) -> str:
    """Retrieve a secret value from Google Secret Manager."""
    secret  = args.get("secret_name")
    version = args.get("version", "latest")
    if not secret:
        return json.dumps({"ok": False, "stderr": "secret_name is required"})
    result = _run([
        "gcloud", "secrets", "versions", "access", version,
        f"--secret={secret}",
        f"--project={GCP_PROJECT}",
    ])
    return json.dumps(result)


def _model_registry_list(args: Dict[str, Any]) -> str:
    """List registered models in Vertex AI Model Registry."""
    result = _run([
        "gcloud", "ai", "models", "list",
        f"--project={GCP_PROJECT}",
        f"--region={GCP_REGION}",
        "--format=json",
    ])
    return json.dumps(result)


def _firestore_query(args: Dict[str, Any]) -> str:
    """Export a Firestore collection snapshot to GCS (read-only)."""
    collection = args.get("collection")
    output_uri = args.get("output_uri", f"gs://{GCP_PROJECT}-exports/firestore/")
    if not collection:
        return json.dumps({"ok": False, "stderr": "collection is required"})
    result = _run([
        "gcloud", "firestore", "export",
        output_uri,
        f"--collection-ids={collection}",
        f"--project={GCP_PROJECT}",
        "--format=json",
    ], timeout=120)
    return json.dumps(result)


# ── GCloudToolkit — assembles all tools for injection into the agent ──────────

class GCloudToolkit:
    """
    Returns a list of loop.Tool objects covering Google Cloud CLI operations.
    Inject into InModelBrainAgent.get_tool_objects() to give the brain
    direct control over GCP resources.
    """

    @staticmethod
    def tools() -> List[Tool]:
        return [
            Tool(
                name="vertex_fine_tune",
                description=(
                    "Launch a Gemma 4 supervised fine-tuning job on Vertex AI Custom Training. "
                    "Pass a GCS dataset URI and the job runs on A100 GPUs."
                ),
                parameters={
                    "base_model":      "HuggingFace model ID (default: google/gemma-4-it)",
                    "dataset_gcs_uri": "gs:// URI of the JSONL training file",
                    "output_gcs_dir":  "gs:// URI for saving the fine-tuned weights",
                    "epochs":          "Number of training epochs (default: 3)",
                    "batch_size":      "Per-device batch size (default: 8)",
                },
                run=_vertex_fine_tune,
                risk_level="high",
            ),
            Tool(
                name="vertex_deploy",
                description=(
                    "Deploy or update a fine-tuned Gemma 4 model endpoint on Vertex AI. "
                    "The endpoint becomes the live company brain."
                ),
                parameters={
                    "model_id":      "Vertex AI model resource ID",
                    "display_name":  "Human-readable name for the endpoint",
                    "machine_type":  "GCE machine type (default: n1-standard-4)",
                    "accelerator":   "GPU accelerator type (default: nvidia-tesla-t4)",
                },
                run=_vertex_deploy,
                risk_level="high",
            ),
            Tool(
                name="gcs_upload",
                description="Upload local training data, model artifacts, or exports to GCS.",
                parameters={
                    "source":      "Local file or directory path",
                    "destination": "gs:// destination URI",
                },
                run=_gcs_upload,
                risk_level="medium",
            ),
            Tool(
                name="gcs_list",
                description="List objects in a GCS bucket or prefix to inspect available data/models.",
                parameters={"uri": "gs:// URI to list (default: project data bucket)"},
                run=_gcs_list,
                risk_level="low",
            ),
            Tool(
                name="bq_query",
                description=(
                    "Run a read-only SELECT query against BigQuery. "
                    "Use for business analytics, audit log review, and growth metrics."
                ),
                parameters={"sql": "BigQuery SQL SELECT statement"},
                run=_bq_query,
                risk_level="low",
            ),
            Tool(
                name="pubsub_publish",
                description="Broadcast an agent event or growth signal to the Pub/Sub topic.",
                parameters={
                    "topic":   "Pub/Sub topic name (default: agent-events)",
                    "message": "Message payload string",
                },
                run=_pubsub_publish,
                risk_level="low",
            ),
            Tool(
                name="cloud_run_deploy",
                description="Deploy a new version of the Agent Mesh API to Cloud Run.",
                parameters={
                    "service_name": "Cloud Run service name",
                    "image":        "Docker image URI (Artifact Registry)",
                    "port":         "Container port (default: 8000)",
                },
                run=_cloud_run_deploy,
                risk_level="high",
            ),
            Tool(
                name="secret_get",
                description="Read an API key or credential from Google Secret Manager.",
                parameters={
                    "secret_name": "Secret name in Secret Manager",
                    "version":     "Version (default: latest)",
                },
                run=_secret_get,
                risk_level="medium",
            ),
            Tool(
                name="model_registry_list",
                description="List all model versions registered in Vertex AI Model Registry.",
                parameters={},
                run=_model_registry_list,
                risk_level="low",
            ),
            Tool(
                name="firestore_export",
                description="Export a Firestore collection to GCS for offline analysis.",
                parameters={
                    "collection": "Firestore collection ID",
                    "output_uri": "gs:// destination for the export",
                },
                run=_firestore_query,
                risk_level="medium",
            ),
        ]

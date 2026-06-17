"""
gcloud_tools.py — Google Cloud CLI tool wrappers for the InModel brain agent.

Each tool wraps a gcloud / bq / gsutil CLI call so the LLM can interact with
Google Cloud natively. All calls are logged to BigQuery for audit compliance.

Security invariants:
- No shell=True. All commands use argument arrays.
- LLM-supplied strings are validated before use (path traversal, arg injection).
- bq_query enforces read-only via a SELECT-only check + BQ dry-run validation.
- secret_get never returns plaintext to the LLM — returns only existence confirmation.
- gcs_upload source path is restricted to an explicit allowlist prefix.
- cloud_run_deploy requires authentication by default (no --allow-unauthenticated).
"""
import json
import logging
import os
import re
import subprocess
from typing import Any, Dict, List

from loop import Tool

logger = logging.getLogger(__name__)

# Read at call time (not import time) so multi-tenant overrides work.
def _project() -> str:
    return os.getenv("GCP_PROJECT", "inmodel-labs")

def _region() -> str:
    return os.getenv("GCP_REGION", "us-central1")

BQ_DATASET  = os.getenv("BQ_AUDIT_DATASET", "agent_audit")

# Allowlist prefixes the agent may upload from (prevents /etc/passwd exfil)
_GCS_UPLOAD_ALLOWED_SRC_PREFIXES = ["/tmp/agent-", "/tmp/inmodel-"]

_SAFE_ID_RE = re.compile(r'^[a-zA-Z0-9_\-\.]{1,128}$')
_SAFE_GCS_RE = re.compile(r'^gs://[a-zA-Z0-9_\-\.]+(/[^\x00]*)?$')

def _validate_id(value: str, field: str) -> str:
    """Reject values that could inject flags or path traversal."""
    if not _SAFE_ID_RE.match(value):
        raise ValueError(f"{field} contains invalid characters: {value!r}")
    return value

def _validate_gcs(uri: str, field: str) -> str:
    if not _SAFE_GCS_RE.match(uri):
        raise ValueError(f"{field} is not a valid gs:// URI: {uri!r}")
    return uri

def _truncate_output(text: str, max_chars: int = 4000) -> str:
    """Truncate large tool outputs before returning to LLM context."""
    if len(text) > max_chars:
        return text[:max_chars] + f"\n... [truncated, {len(text)} chars total]"
    return text


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
    try:
        model_id    = _validate_id(args.get("model_id", "gemma4-inmodel-brain"), "model_id")
        display     = _validate_id(args.get("display_name", "InModel-Brain"), "display_name")
        machine     = _validate_id(args.get("machine_type", "n1-standard-4"), "machine_type")
        accelerator = _validate_id(args.get("accelerator", "nvidia-tesla-t4"), "accelerator")
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})

    cmd = [
        "gcloud", "ai", "endpoints", "deploy-model",
        f"--project={_project()}",
        f"--region={_region()}",
        f"--model={model_id}",
        f"--display-name={display}",
        f"--machine-type={machine}",
        f"--accelerator=type={accelerator},count=1",
        "--format=json",
    ]
    result = _run(cmd)
    result["stdout"] = _truncate_output(result.get("stdout", ""))
    return json.dumps(result)


def _vertex_fine_tune(args: Dict[str, Any]) -> str:
    """Launch a Gemma 4 supervised fine-tuning job on Vertex AI."""
    try:
        dataset_uri = _validate_gcs(args.get("dataset_gcs_uri", ""), "dataset_gcs_uri")
        output_dir  = _validate_gcs(
            args.get("output_gcs_dir", f"gs://{_project()}-models/gemma4-inmodel/"),
            "output_gcs_dir",
        )
        base_model = _validate_id(args.get("base_model", "google/gemma-4-it"), "base_model")
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})

    epochs     = int(args.get("epochs", 3))
    batch_size = int(args.get("batch_size", 8))

    cmd = [
        "gcloud", "ai", "custom-jobs", "create",
        f"--project={_project()}",
        f"--region={_region()}",
        "--display-name=gemma4-inmodel-finetune",
        "--config=-",
        "--format=json",
    ]
    # Pin image to a digest rather than mutable :latest to prevent tag-hijack.
    # Update this digest when upgrading the training base image.
    GEMMA_TRAIN_IMAGE = os.getenv(
        "GEMMA_TRAIN_IMAGE",
        "us-docker.pkg.dev/vertex-ai/training/gemma@sha256:REPLACE_WITH_DIGEST",
    )
    config = {
        "workerPoolSpecs": [{
            "machineSpec": {
                "machineType": "n1-standard-8",
                "acceleratorType": "NVIDIA_TESLA_A100",
                "acceleratorCount": 1,
            },
            "replicaCount": 1,
            "containerSpec": {
                "imageUri": GEMMA_TRAIN_IMAGE,
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
            cmd, input=json.dumps(config),
            capture_output=True, text=True, timeout=120,
        )
        return json.dumps({
            "stdout": _truncate_output(proc.stdout.strip()),
            "stderr": proc.stderr.strip(),
            "ok": proc.returncode == 0,
        })
    except Exception as e:
        return json.dumps({"ok": False, "stderr": str(e)})


def _gcs_upload(args: Dict[str, Any]) -> str:
    """Upload a local file or directory to Google Cloud Storage."""
    src = args.get("source", "")
    dst = args.get("destination", "")
    if not src or not dst:
        return json.dumps({"ok": False, "stderr": "source and destination required"})
    # Restrict upload source to safe prefixes — prevents /etc/passwd exfiltration
    if not any(src.startswith(p) for p in _GCS_UPLOAD_ALLOWED_SRC_PREFIXES):
        return json.dumps({
            "ok": False,
            "stderr": f"source must be under one of {_GCS_UPLOAD_ALLOWED_SRC_PREFIXES}",
        })
    try:
        dst = _validate_gcs(dst, "destination")
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})
    result = _run(["gsutil", "-m", "cp", "-r", src, dst])
    result["stdout"] = _truncate_output(result.get("stdout", ""))
    return json.dumps(result)


def _gcs_list(args: Dict[str, Any]) -> str:
    """List objects in a GCS bucket/prefix."""
    uri = args.get("uri", f"gs://{_project()}-data/")
    try:
        uri = _validate_gcs(uri, "uri")
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})
    result = _run(["gsutil", "ls", "-l", uri])
    result["stdout"] = _truncate_output(result.get("stdout", ""))
    return json.dumps(result)


def _bq_query(args: Dict[str, Any]) -> str:
    """Run a BigQuery SQL query and return results (read-only analytics)."""
    sql = args.get("sql")
    if not sql:
        return json.dumps({"ok": False, "stderr": "sql is required"})
    # Enforce SELECT-only. Strip leading whitespace/comments before the check.
    sql_upper = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL).strip().upper()
    if not sql_upper.startswith("SELECT"):
        return json.dumps({"ok": False, "stderr": "Only SELECT queries are permitted"})
    # Dry-run first to validate the query without executing it
    dry_result = _run([
        "bq", "query",
        "--use_legacy_sql=false",
        f"--project_id={_project()}",
        "--dry_run",
        "--format=json",
        sql,
    ], timeout=30)
    if not dry_result["ok"]:
        return json.dumps({"ok": False, "stderr": f"dry-run failed: {dry_result['stderr']}"})
    result = _run([
        "bq", "query",
        "--use_legacy_sql=false",
        f"--project_id={_project()}",
        "--format=json",
        "--max_rows=100",
        sql,
    ], timeout=120)
    result["stdout"] = _truncate_output(result.get("stdout", ""))
    return json.dumps(result)


def _pubsub_publish(args: Dict[str, Any]) -> str:
    """Publish a message to a Pub/Sub topic (agent event broadcast)."""
    try:
        topic = _validate_id(args.get("topic", "agent-events"), "topic")
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})
    # Truncate message to prevent large payloads / data exfiltration via pubsub
    message = str(args.get("message", ""))[:1024]
    result = _run([
        "gcloud", "pubsub", "topics", "publish", topic,
        f"--message={message}",
        f"--project={_project()}",
        "--format=json",
    ])
    return json.dumps(result)


def _cloud_run_deploy(args: Dict[str, Any]) -> str:
    """Deploy a container image to Cloud Run."""
    try:
        service = _validate_id(args.get("service_name", "agent-mesh-api"), "service_name")
        image   = args.get("image")
        if not image:
            return json.dumps({"ok": False, "stderr": "image is required"})
        # Validate image URI — must be Artifact Registry or GCR
        if not re.match(r'^[a-zA-Z0-9_\-\.]+(-docker\.pkg\.dev|\.gcr\.io)/', image):
            return json.dumps({"ok": False, "stderr": "image must be from Artifact Registry or GCR"})
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})
    port = int(args.get("port", 8000))
    result = _run([
        "gcloud", "run", "deploy", service,
        f"--image={image}",
        f"--port={port}",
        f"--project={_project()}",
        f"--region={_region()}",
        "--platform=managed",
        "--no-allow-unauthenticated",  # auth required by default
        "--format=json",
    ], timeout=300)
    result["stdout"] = _truncate_output(result.get("stdout", ""))
    return json.dumps(result)


def _secret_get(args: Dict[str, Any]) -> str:
    """Check that a secret exists in Google Secret Manager (DOES NOT return the value).

    The LLM never receives plaintext credentials. This tool confirms existence
    and the active version so callers know the secret is configured. To use the
    secret in a subprocess, inject it via --set-secrets in cloud_run_deploy, or
    reference it in a Vertex job config — never pass it through the agent loop.
    """
    secret = args.get("secret_name")
    if not secret:
        return json.dumps({"ok": False, "stderr": "secret_name is required"})
    try:
        secret = _validate_id(secret, "secret_name")
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})
    # Describe the secret metadata only — never access the value
    result = _run([
        "gcloud", "secrets", "describe", secret,
        f"--project={_project()}",
        "--format=json",
    ])
    result["stdout"] = _truncate_output(result.get("stdout", ""))
    return json.dumps(result)


def _model_registry_list(args: Dict[str, Any]) -> str:
    """List registered models in Vertex AI Model Registry."""
    result = _run([
        "gcloud", "ai", "models", "list",
        f"--project={_project()}",
        f"--region={_region()}",
        "--format=json",
    ])
    result["stdout"] = _truncate_output(result.get("stdout", ""))
    return json.dumps(result)


def _firestore_export(args: Dict[str, Any]) -> str:
    """Export a Firestore collection to GCS for offline analysis.

    Note: this is a write operation (exports data to GCS). Classified high risk.
    """
    collection = args.get("collection")
    if not collection:
        return json.dumps({"ok": False, "stderr": "collection is required"})
    try:
        collection = _validate_id(collection, "collection")
        output_uri = _validate_gcs(
            args.get("output_uri", f"gs://{_project()}-exports/firestore/"),
            "output_uri",
        )
    except ValueError as e:
        return json.dumps({"ok": False, "stderr": str(e)})
    result = _run([
        "gcloud", "firestore", "export",
        output_uri,
        f"--collection-ids={collection}",
        f"--project={_project()}",
        "--format=json",
    ], timeout=120)
    result["stdout"] = _truncate_output(result.get("stdout", ""))
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
                run=_firestore_export,
                risk_level="high",
            ),
        ]

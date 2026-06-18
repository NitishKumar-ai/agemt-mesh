import os
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# ── Cloud Logging ──────────────────────────────────────────────────────────────
def setup_cloud_logging():
    # If running on GCP (GOOGLE_CLOUD_PROJECT set), install google-cloud-logging
    # Otherwise fall back to standard logging
    project = os.getenv('GOOGLE_CLOUD_PROJECT')
    if not project:
        logging.basicConfig(level=logging.INFO)
        return
    try:
        import google.cloud.logging
        client = google.cloud.logging.Client(project=project)
        client.setup_logging()
        logger.info('Cloud Logging initialized for project %s', project)
    except ImportError:
        logging.basicConfig(level=logging.INFO)

# ── Secret Manager ─────────────────────────────────────────────────────────────
@lru_cache(maxsize=64)
def get_secret(secret_id: str, version: str = 'latest') -> Optional[str]:
    # First check env var (local dev / Cloud Run --set-env-vars)
    env_val = os.getenv(secret_id)
    if env_val:
        return env_val
    # Try Secret Manager
    project = os.getenv('GOOGLE_CLOUD_PROJECT')
    if not project:
        return None
    try:
        from google.cloud import secretmanager
        client = secretmanager.SecretManagerServiceClient()
        name = f'projects/{project}/secrets/{secret_id}/versions/{version}'
        response = client.access_secret_version(request={'name': name})
        return response.payload.data.decode('UTF-8').strip()
    except Exception as e:
        logger.warning('Secret %s not found: %s', secret_id, e)
        return None

# ── Cloud SQL ──────────────────────────────────────────────────────────────────
def get_database_url() -> str:
    # Explicit env var wins (Cloud Run sets this via --set-env-vars)
    url = os.getenv('APP_DATABASE_URL')
    if url:
        return url
    # Cloud SQL via Unix socket (when CLOUD_SQL_CONNECTION_NAME is set)
    conn = os.getenv('CLOUD_SQL_CONNECTION_NAME')
    if conn:
        db_user = get_secret('DB_USER') or 'agent_mesh'
        db_pass = get_secret('DB_PASS') or ''
        db_name = get_secret('DB_NAME') or 'agent_mesh'
        return f'postgresql+psycopg2://{db_user}:{db_pass}@/{db_name}?host=/cloudsql/{conn}'
    # SQLite fallback for local dev
    return 'sqlite:///agent_mesh.sqlite'

# ── GCS Storage ────────────────────────────────────────────────────────────────
def upload_to_gcs(bucket: str, blob_name: str, data: bytes, content_type: str = 'application/octet-stream') -> str:
    from google.cloud import storage
    client = storage.Client()
    bucket_obj = client.bucket(bucket)
    blob = bucket_obj.blob(blob_name)
    blob.upload_from_string(data, content_type=content_type)
    return f'gs://{bucket}/{blob_name}'

def download_from_gcs(bucket: str, blob_name: str) -> bytes:
    from google.cloud import storage
    client = storage.Client()
    return client.bucket(bucket).blob(blob_name).download_as_bytes()

# ── Vertex AI / Gemini ─────────────────────────────────────────────────────────
def get_vertex_model_endpoint(model_id: str) -> str:
    project = os.getenv('GOOGLE_CLOUD_PROJECT', '')
    region = os.getenv('VERTEX_REGION', 'us-central1')
    return f'projects/{project}/locations/{region}/endpoints/{model_id}'

# ── Health check ───────────────────────────────────────────────────────────────  
def gcp_health() -> dict:
    return {
        'project': os.getenv('GOOGLE_CLOUD_PROJECT', 'local'),
        'cloud_sql': bool(os.getenv('CLOUD_SQL_CONNECTION_NAME')),
        'db_url_set': bool(os.getenv('APP_DATABASE_URL')),
        'running_on_gcp': bool(os.getenv('K_SERVICE')),  # Cloud Run sets K_SERVICE
    }

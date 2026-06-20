"""
store.py — All DBOS @transaction() functions for business data.

Replaces the sqlite3 _db() pattern in api.py. Every table lives in the
same Postgres database as DBOS execution state, so workflow writes and
API reads are always in sync.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from dbos import DBOS
from sqlalchemy import text

from github_integration import (
    GitHubConfigurationError,
    decrypt_token,
    encrypt_token,
)

_INTERVALS = {"hourly": 3600, "daily": 86400, "weekly": 604800, "monthly": 2592000}


class KillswitchEngaged(Exception):
    """Raised when an operation is blocked by the global killswitch."""
    pass


# ── Schema ────────────────────────────────────────────────────────────────────

def init_business_tables(engine=None) -> None:
    """
    Create all business tables using a raw SQLAlchemy engine.

    Intentionally NOT a @DBOS.transaction() — DDL at startup must not use
    DBOS transactions (they require a workflow context and cannot be nested).
    Accepts an optional engine; if None, creates a SQLite engine as fallback.
    """
    import os
    if engine is None:
        from sqlalchemy import create_engine
        db_url = os.environ.get("APP_DATABASE_URL", "sqlite:///agent_mesh.sqlite")
        engine = create_engine(db_url, connect_args={"check_same_thread": False} if "sqlite" in db_url else {})

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS github_connections (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                github_user_id BIGINT NOT NULL,
                login TEXT NOT NULL,
                name TEXT,
                avatar_url TEXT,
                html_url TEXT,
                token_encrypted TEXT NOT NULL,
                scopes TEXT,
                connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS github_imported_repositories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                github_repo_id BIGINT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                html_url TEXT NOT NULL,
                default_branch TEXT,
                private INTEGER DEFAULT 0,
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS suggested_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                marker TEXT NOT NULL,
                comment TEXT NOT NULL,
                context_snippet TEXT,
                rationale TEXT,
                confidence INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                workflow_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS scheduled_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                interval TEXT NOT NULL,
                next_run_at TIMESTAMP NOT NULL,
                last_run_at TIMESTAMP,
                last_status TEXT,
                enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run "
            "ON scheduled_tasks(next_run_at, enabled)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS webhook_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                event_type TEXT NOT NULL,
                branch TEXT,
                payload TEXT,
                workflow_id TEXT,
                status TEXT DEFAULT 'received',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS security_findings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_agent TEXT NOT NULL DEFAULT 'CommitGuardAgent',
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                evidence TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'medium',
                repository TEXT,
                status TEXT NOT NULL DEFAULT 'review_required',
                verified_by TEXT,
                verified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                connector_type TEXT NOT NULL,
                config_encrypted TEXT NOT NULL,
                metadata TEXT,
                status TEXT DEFAULT 'connected',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS marketing_audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type TEXT NOT NULL,
                entity_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT 'system',
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS marketing_campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_finding_id INTEGER,
                name TEXT NOT NULL,
                audience TEXT NOT NULL,
                finding_summary TEXT NOT NULL,
                value_proposition TEXT,
                channel TEXT DEFAULT 'email',
                status TEXT DEFAULT 'draft',
                subject TEXT,
                body TEXT,
                approval_note TEXT,
                audience_embedding TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS commitguard_scans (
                job_id TEXT PRIMARY KEY,
                repo_url TEXT NOT NULL,
                status TEXT DEFAULT 'queued',
                step TEXT,
                progress_pct INTEGER DEFAULT 0,
                total_semgrep_hits INTEGER,
                findings_truncated INTEGER DEFAULT 0,
                scan_duration_s INTEGER,
                user_github_login TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS commitguard_findings (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                file TEXT NOT NULL,
                line INTEGER NOT NULL,
                severity TEXT NOT NULL,
                verdict TEXT NOT NULL,
                poc_summary TEXT,
                cvss TEXT,
                cwe TEXT,
                fix_suggestion TEXT,
                github_issue_url TEXT,
                issue_filed INTEGER DEFAULT 0,
                webhook_fired INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_cg_findings_job ON commitguard_findings(job_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_run_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                model TEXT,
                prompt_tokens INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_agent_run_tokens_run "
            "ON agent_run_tokens(run_id)"
        ))
        # ── Safety / CriticGate tables ───────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS safety_trace_frames (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                step_index INTEGER NOT NULL,
                thought TEXT NOT NULL,
                proposed_action TEXT NOT NULL,
                justification TEXT NOT NULL,
                dependencies TEXT DEFAULT '[]',
                context_hash TEXT,
                frame_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_safety_trace_run "
            "ON safety_trace_frames(run_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS safety_critic_verdicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                frame_hash TEXT NOT NULL,
                verdict TEXT NOT NULL,
                confidence REAL NOT NULL,
                reasoning TEXT NOT NULL,
                checks TEXT DEFAULT '{}',
                risk_tier TEXT DEFAULT 'low',
                recursion_depth INTEGER DEFAULT 0,
                counterfactual_flag INTEGER DEFAULT 0,
                critic_model TEXT,
                eval_duration_ms INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_safety_verdicts_run "
            "ON safety_critic_verdicts(run_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_safety_verdicts_verdict "
            "ON safety_critic_verdicts(verdict)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS safety_escalations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                frame_hash TEXT NOT NULL,
                verdict_id INTEGER,
                escalation_type TEXT NOT NULL,
                resolved INTEGER DEFAULT 0,
                resolved_by TEXT,
                resolution TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                action TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT 'system',
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_audit_events_entity "
            "ON audit_events(entity_type, entity_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS social_connections (
                platform TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                api_key_encrypted TEXT NOT NULL,
                username TEXT,
                avatar_url TEXT,
                status TEXT DEFAULT 'active',
                scopes TEXT,
                connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # ── Social Studio ─────────────────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS social_studio_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                username TEXT,
                avatar_url TEXT,
                follower_count INTEGER DEFAULT 0,
                access_token_encrypted TEXT NOT NULL,
                refresh_token_encrypted TEXT,
                token_expires_at TIMESTAMP,
                scopes TEXT,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(platform, account_id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssa_platform ON social_studio_accounts(platform)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS social_studio_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                account_id INTEGER REFERENCES social_studio_accounts(id),
                platform TEXT NOT NULL,
                content TEXT NOT NULL,
                hashtags TEXT,
                char_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'draft',
                platform_post_id TEXT,
                platform_post_url TEXT,
                scheduled_at TIMESTAMP,
                published_at TIMESTAMP,
                likes INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                reach INTEGER DEFAULT 0,
                impressions INTEGER DEFAULT 0,
                error TEXT,
                topic TEXT,
                tone TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssp_run ON social_studio_posts(run_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssp_platform ON social_studio_posts(platform, status)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS social_studio_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES social_studio_accounts(id),
                platform TEXT NOT NULL,
                snapshot_date TEXT NOT NULL,
                followers INTEGER DEFAULT 0,
                followers_gained INTEGER DEFAULT 0,
                impressions INTEGER DEFAULT 0,
                reach INTEGER DEFAULT 0,
                engagements INTEGER DEFAULT 0,
                posts_count INTEGER DEFAULT 0,
                avg_engagement_rate REAL DEFAULT 0.0,
                top_post_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(account_id, snapshot_date)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssa_analytics ON social_studio_analytics(account_id, snapshot_date)"
        ))
        # Platform-specific post variants with full state machine
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ss_platform_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL REFERENCES social_studio_posts(id) ON DELETE CASCADE,
                account_id INTEGER REFERENCES social_studio_accounts(id),
                platform TEXT NOT NULL,
                caption TEXT,
                hashtags TEXT,
                char_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'draft',
                platform_post_id TEXT,
                platform_post_url TEXT,
                publish_error TEXT,
                scheduled_at TIMESTAMP,
                published_at TIMESTAMP,
                retry_count INTEGER DEFAULT 0,
                next_retry_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                media_type TEXT DEFAULT 'TEXT',
                video_file_path TEXT,
                thumbnail_file_path TEXT,
                video_duration_seconds INTEGER,
                privacy_status TEXT DEFAULT 'public',
                video_category_id TEXT DEFAULT '22',
                made_for_kids INTEGER DEFAULT 0,
                video_source TEXT DEFAULT 'upload',
                veo3_prompt TEXT,
                image_url TEXT
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_sspp_post ON ss_platform_posts(post_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_sspp_status ON ss_platform_posts(status, scheduled_at)"
        ))
        # Append-only publish attempt log (90-day TTL)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ss_publish_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform_post_id INTEGER NOT NULL REFERENCES ss_platform_posts(id),
                attempt_number INTEGER DEFAULT 1,
                status_code INTEGER,
                response_body TEXT,
                error_message TEXT,
                duration_ms INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssplog_pp ON ss_publish_log(platform_post_id)"
        ))
        # Video upload tracking table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ss_video_uploads (
                id TEXT PRIMARY KEY,
                platform_post_id INTEGER REFERENCES ss_platform_posts(id),
                file_path TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                duration_seconds INTEGER,
                format TEXT,
                resolution TEXT,
                upload_progress_bytes INTEGER DEFAULT 0,
                upload_status TEXT DEFAULT 'pending',
                source TEXT DEFAULT 'upload',
                veo3_prompt TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                uploaded_at TIMESTAMP,
                deleted_at TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssvid_pp ON ss_video_uploads(platform_post_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssvid_status ON ss_video_uploads(upload_status)"
        ))
        # Flexible metric-key daily snapshots (from brightbean pattern)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ss_metric_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES social_studio_accounts(id),
                metric_key TEXT NOT NULL,
                date TEXT NOT NULL,
                value REAL DEFAULT 0.0,
                captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(account_id, metric_key, date)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssms_account ON ss_metric_snapshots(account_id, metric_key, date)"
        ))
        # Per-post metric snapshots
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ss_post_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform_post_id INTEGER NOT NULL REFERENCES ss_platform_posts(id),
                metric_key TEXT NOT NULL,
                date TEXT NOT NULL,
                value REAL DEFAULT 0.0,
                captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(platform_post_id, metric_key, date)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_sspmet_pp ON ss_post_metrics(platform_post_id, date)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ss_ideas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                status TEXT DEFAULT 'unassigned',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_ssideas_status ON ss_ideas(status)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS killswitch_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                engaged INTEGER DEFAULT 0,
                engaged_at TIMESTAMP,
                engaged_by TEXT,
                reason TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # Ensure a row exists
        conn.execute(text("INSERT OR IGNORE INTO killswitch_state (id, engaged) VALUES (1, 0)"))


# ── GitHub ────────────────────────────────────────────────────────────────────

@DBOS.transaction()
def github_save_connection(user: dict, token: str, scopes: str) -> None:
    DBOS.sql_session.execute(text("""
        INSERT INTO github_connections (
            id, github_user_id, login, name, avatar_url, html_url,
            token_encrypted, scopes, updated_at
        ) VALUES (1, :uid, :login, :name, :avatar, :html_url, :token_enc, :scopes, :now)
        ON CONFLICT (id) DO UPDATE SET
            github_user_id = EXCLUDED.github_user_id,
            login          = EXCLUDED.login,
            name           = EXCLUDED.name,
            avatar_url     = EXCLUDED.avatar_url,
            html_url       = EXCLUDED.html_url,
            token_encrypted= EXCLUDED.token_encrypted,
            scopes         = EXCLUDED.scopes,
            updated_at     = EXCLUDED.updated_at
    """), {
        "uid": user["id"],
        "login": user["login"],
        "name": user.get("name"),
        "avatar": user.get("avatar_url"),
        "html_url": user.get("html_url"),
        "token_enc": encrypt_token(token),
        "scopes": scopes,
        "now": datetime.utcnow().isoformat(),
    })


@DBOS.transaction()
def github_get_connection() -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT github_user_id, login, name, avatar_url, html_url, "
        "token_encrypted, scopes, connected_at FROM github_connections WHERE id=1"
    )).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def github_get_access_token() -> str:
    row = DBOS.sql_session.execute(text(
        "SELECT token_encrypted FROM github_connections WHERE id=1"
    )).fetchone()
    if not row:
        raise GitHubConfigurationError("GitHub account is not connected")
    return decrypt_token(row[0])


@DBOS.transaction()
def github_delete_connection() -> None:
    DBOS.sql_session.execute(text("DELETE FROM github_connections WHERE id=1"))


@DBOS.transaction()
def github_imported_count() -> int:
    return DBOS.sql_session.execute(
        text("SELECT COUNT(*) FROM github_imported_repositories")
    ).scalar() or 0


@DBOS.transaction()
def github_get_imported_repos() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT github_repo_id AS id, full_name, html_url, default_branch, "
        "private, imported_at FROM github_imported_repositories ORDER BY imported_at DESC"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def github_upsert_repo(repo: dict) -> None:
    DBOS.sql_session.execute(text("""
        INSERT INTO github_imported_repositories (
            github_repo_id, full_name, html_url, default_branch, private
        ) VALUES (:rid, :full_name, :html_url, :default_branch, :private)
        ON CONFLICT (github_repo_id) DO UPDATE SET
            full_name      = EXCLUDED.full_name,
            html_url       = EXCLUDED.html_url,
            default_branch = EXCLUDED.default_branch,
            private        = EXCLUDED.private
    """), {
        "rid": repo["id"],
        "full_name": repo["full_name"],
        "html_url": repo["html_url"],
        "default_branch": repo.get("default_branch"),
        "private": int(repo["private"]),
    })


# ── Security Findings ─────────────────────────────────────────────────────────

@DBOS.transaction()
def security_list_findings() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, source_agent, title, summary, evidence, severity, repository, "
        "status, verified_by, verified_at, created_at "
        "FROM security_findings ORDER BY created_at DESC"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def security_get_finding(finding_id: int) -> Optional[dict]:
    """Return a single security finding by id, or None."""
    row = DBOS.sql_session.execute(text(
        "SELECT id, source_agent, title, summary, evidence, severity, repository, "
        "status, verified_by, verified_at, created_at "
        "FROM security_findings WHERE id=:fid"
    ), {"fid": finding_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def security_create_finding(source_agent: str, title: str, summary: str,
                             evidence: str, severity: str, repository: str) -> int:
    finding_id = DBOS.sql_session.execute(text(
        "INSERT INTO security_findings "
        "(source_agent, title, summary, evidence, severity, repository) "
        "VALUES (:agent, :title, :summary, :evidence, :severity, :repo) RETURNING id"
    ), {"agent": source_agent, "title": title, "summary": summary,
        "evidence": evidence, "severity": severity, "repo": repository}).scalar()
    _audit("finding", finding_id, "finding_created", source_agent,
           {"severity": severity, "repository": repository})
    return finding_id


@DBOS.transaction()
def security_verify_finding(finding_id: int, verified_by: str) -> bool:
    row = DBOS.sql_session.execute(
        text("SELECT id FROM security_findings WHERE id=:fid"), {"fid": finding_id}
    ).fetchone()
    if not row:
        return False
    DBOS.sql_session.execute(text(
        "UPDATE security_findings SET status='verified', verified_by=:by, "
        "verified_at=CURRENT_TIMESTAMP WHERE id=:fid"
    ), {"by": verified_by, "fid": finding_id})
    _audit("finding", finding_id, "finding_verified", verified_by, {})
    return True


# ── Marketing Campaigns ───────────────────────────────────────────────────────

@DBOS.transaction()
def marketing_list_audience_embeddings(limit: int = 50) -> list[list[float]]:
    """Return the last `limit` non-null audience embeddings for dedup checks."""
    rows = DBOS.sql_session.execute(text(
        "SELECT audience_embedding FROM marketing_campaigns "
        "WHERE audience_embedding IS NOT NULL "
        "ORDER BY created_at DESC LIMIT :lim"
    ), {"lim": limit}).fetchall()
    result = []
    for row in rows:
        try:
            result.append(json.loads(row[0]))
        except (TypeError, ValueError):
            logger.warning("marketing_list_audience_embeddings: skipping corrupt embedding row")
            pass
    return result


@DBOS.transaction()
def marketing_save_audience_embedding(campaign_id: int, embedding: list[float]) -> None:
    """Persist the HF audience embedding so future campaigns can dedup against it."""
    DBOS.sql_session.execute(text(
        "UPDATE marketing_campaigns SET audience_embedding=:emb WHERE id=:cid"
    ), {"emb": json.dumps(embedding), "cid": campaign_id})


@DBOS.transaction()
def marketing_list_campaigns() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, source_finding_id, name, audience, finding_summary, value_proposition, "
        "channel, status, subject, body, approval_note, created_at, updated_at "
        "FROM marketing_campaigns ORDER BY created_at DESC"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def marketing_get_campaign(campaign_id: int) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT id, source_finding_id, name, audience, finding_summary, "
        "value_proposition, channel, status, subject, body "
        "FROM marketing_campaigns WHERE id=:cid"
    ), {"cid": campaign_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def marketing_create_campaign(source_finding_id: int, name: str, audience: str,
                               finding_summary: str, value_proposition: str,
                               channel: str) -> tuple:
    """Returns (campaign_id, actual_finding_summary). Raises ValueError on bad input."""
    finding = DBOS.sql_session.execute(text(
        "SELECT summary, status FROM security_findings WHERE id=:fid"
    ), {"fid": source_finding_id}).fetchone()
    if not finding:
        raise ValueError("source_finding_not_found")
    if finding[1] != "verified":
        raise ValueError("source_finding_not_verified")
    actual_summary = finding[0]
    campaign_id = DBOS.sql_session.execute(text(
        "INSERT INTO marketing_campaigns "
        "(source_finding_id, name, audience, finding_summary, value_proposition, channel) "
        "VALUES (:sfid, :name, :audience, :summary, :vp, :channel) RETURNING id"
    ), {"sfid": source_finding_id, "name": name, "audience": audience,
        "summary": actual_summary, "vp": value_proposition, "channel": channel}).scalar()
    _audit("campaign", campaign_id, "campaign_created", "operator",
           {"source_finding_id": source_finding_id, "channel": channel})
    return campaign_id, actual_summary


@DBOS.transaction()
def marketing_update_draft(campaign_id: int, subject: str, body: str) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE marketing_campaigns SET subject=:sub, body=:body, "
        "status='review_required', updated_at=CURRENT_TIMESTAMP WHERE id=:cid"
    ), {"sub": subject, "body": body, "cid": campaign_id})
    _audit("campaign", campaign_id, "draft_generated", "MarketingAgent", {"subject": subject})


@DBOS.transaction()
def marketing_approve_campaign(campaign_id: int, note: str) -> str:
    """Returns 'approved', 'not_found', or 'no_draft'."""
    row = DBOS.sql_session.execute(text(
        "SELECT body FROM marketing_campaigns WHERE id=:cid"
    ), {"cid": campaign_id}).fetchone()
    if not row:
        return "not_found"
    if not row[0]:
        return "no_draft"
    DBOS.sql_session.execute(text(
        "UPDATE marketing_campaigns SET status='approved', approval_note=:note, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:cid"
    ), {"note": note, "cid": campaign_id})
    _audit("campaign", campaign_id, "campaign_approved", "operator", {"note": note})
    return "approved"


@DBOS.transaction()
def marketing_list_audit_events() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, entity_type, entity_id, action, actor, payload, created_at "
        "FROM marketing_audit_events ORDER BY created_at DESC, id DESC LIMIT 200"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


# ── CommitGuard ───────────────────────────────────────────────────────────────

@DBOS.transaction()
def commitguard_create_scan(job_id: str, repo_url: str, github_login: str) -> None:
    DBOS.sql_session.execute(text(
        "INSERT INTO commitguard_scans (job_id, repo_url, status, step, user_github_login) "
        "VALUES (:jid, :url, 'queued', 'queued', :login)"
    ), {"jid": job_id, "url": repo_url, "login": github_login})


@DBOS.transaction()
def commitguard_get_scan(job_id: str) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT job_id, status, step, progress_pct, total_semgrep_hits, findings_truncated "
        "FROM commitguard_scans WHERE job_id=:jid"
    ), {"jid": job_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def commitguard_get_scan_with_findings(job_id: str) -> Optional[dict]:
    scan = DBOS.sql_session.execute(text(
        "SELECT job_id, repo_url, scan_duration_s, total_semgrep_hits, findings_truncated "
        "FROM commitguard_scans WHERE job_id=:jid"
    ), {"jid": job_id}).fetchone()
    if not scan:
        return None
    findings = DBOS.sql_session.execute(text(
        "SELECT id, file, line, severity, verdict, poc_summary, cvss, cwe, "
        "fix_suggestion, github_issue_url, issue_filed "
        "FROM commitguard_findings WHERE job_id=:jid ORDER BY created_at"
    ), {"jid": job_id}).fetchall()
    result = dict(scan._mapping)
    result["findings"] = [dict(f._mapping) for f in findings]
    return result


# ── Suggested Tasks ───────────────────────────────────────────────────────────

@DBOS.transaction()
def tasks_list() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, file_path, line_number, marker, comment, rationale, confidence, status "
        "FROM suggested_tasks ORDER BY confidence DESC, created_at DESC LIMIT 50"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def tasks_save(file_path: str, line_number: int, marker: str, comment: str,
               context_snippet: str, rationale: str, confidence: int) -> None:
    DBOS.sql_session.execute(text(
        "INSERT INTO suggested_tasks "
        "(file_path, line_number, marker, comment, context_snippet, rationale, confidence) "
        "VALUES (:fp, :ln, :marker, :comment, :ctx, :rationale, :conf)"
    ), {"fp": file_path, "ln": line_number, "marker": marker, "comment": comment,
        "ctx": context_snippet, "rationale": rationale, "conf": confidence})


@DBOS.transaction()
def tasks_get(task_id: int) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT id, file_path, line_number, marker, comment, rationale, confidence, status "
        "FROM suggested_tasks WHERE id=:tid"
    ), {"tid": task_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def tasks_mark_running(task_id: int) -> None:
    DBOS.sql_session.execute(
        text("UPDATE suggested_tasks SET status='running' WHERE id=:tid"), {"tid": task_id}
    )


# ── Scheduled Tasks ───────────────────────────────────────────────────────────

@DBOS.transaction()
def schedule_create(name: str, prompt: str, interval: str) -> int:
    seconds = _INTERVALS.get(interval, 86400)
    next_run = datetime.utcnow() + timedelta(seconds=seconds)
    return DBOS.sql_session.execute(text(
        "INSERT INTO scheduled_tasks (name, prompt, interval, next_run_at) "
        "VALUES (:name, :prompt, :interval, :next_run) RETURNING id"
    ), {"name": name, "prompt": prompt, "interval": interval, "next_run": next_run}).scalar()


@DBOS.transaction()
def schedule_list() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, name, prompt, interval, next_run_at, last_run_at, last_status, enabled "
        "FROM scheduled_tasks ORDER BY created_at DESC"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def schedule_get_due() -> list:
    now = datetime.utcnow()
    rows = DBOS.sql_session.execute(text(
        "SELECT id, name, prompt, interval FROM scheduled_tasks "
        "WHERE enabled=1 AND next_run_at <= :now"
    ), {"now": now}).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def schedule_mark_ran(task_id: int, status: str, interval: str) -> None:
    seconds = _INTERVALS.get(interval, 86400)
    next_run = datetime.utcnow() + timedelta(seconds=seconds)
    now = datetime.utcnow()
    DBOS.sql_session.execute(text(
        "UPDATE scheduled_tasks SET last_run_at=:now, last_status=:status, "
        "next_run_at=:next_run WHERE id=:tid"
    ), {"now": now, "status": status, "next_run": next_run, "tid": task_id})


@DBOS.transaction()
def schedule_disable(task_id: int) -> None:
    DBOS.sql_session.execute(
        text("UPDATE scheduled_tasks SET enabled=0 WHERE id=:tid"), {"tid": task_id}
    )


@DBOS.transaction()
def schedule_enable(task_id: int) -> bool:
    row = DBOS.sql_session.execute(
        text("SELECT id FROM scheduled_tasks WHERE id=:tid"), {"tid": task_id}
    ).fetchone()
    if not row:
        return False
    seconds = 0
    interval_row = DBOS.sql_session.execute(
        text("SELECT interval FROM scheduled_tasks WHERE id=:tid"), {"tid": task_id}
    ).fetchone()
    if interval_row:
        seconds = _INTERVALS.get(interval_row[0], 86400)
    next_run = datetime.utcnow() + timedelta(seconds=seconds)
    DBOS.sql_session.execute(text(
        "UPDATE scheduled_tasks SET enabled=1, next_run_at=:next_run WHERE id=:tid"
    ), {"tid": task_id, "next_run": next_run})
    return True


@DBOS.transaction()
def schedule_update(task_id: int, name: Optional[str] = None,
                    prompt: Optional[str] = None, interval: Optional[str] = None) -> bool:
    row = DBOS.sql_session.execute(
        text("SELECT id FROM scheduled_tasks WHERE id=:tid"), {"tid": task_id}
    ).fetchone()
    if not row:
        return False
    updates = []
    params: dict = {"tid": task_id}
    if name is not None:
        updates.append("name=:name")
        params["name"] = name
    if prompt is not None:
        updates.append("prompt=:prompt")
        params["prompt"] = prompt
    if interval is not None:
        updates.append("interval=:interval")
        params["interval"] = interval
        seconds = _INTERVALS.get(interval, 86400)
        next_run = datetime.utcnow() + timedelta(seconds=seconds)
        updates.append("next_run_at=:next_run")
        params["next_run"] = next_run
    if updates:
        DBOS.sql_session.execute(
            text(f"UPDATE scheduled_tasks SET {', '.join(updates)} WHERE id=:tid"), params
        )
    return True


@DBOS.transaction()
def schedule_get(task_id: int) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT id, name, prompt, interval, next_run_at, last_run_at, last_status, enabled "
        "FROM scheduled_tasks WHERE id=:tid"
    ), {"tid": task_id}).fetchone()
    return dict(row._mapping) if row else None


# ── Social Connections ───────────────────────────────────────────────────────

@DBOS.transaction()
def social_save_connection(platform: str, display_name: str, api_key_encrypted: str,
                           username: Optional[str] = None, avatar_url: Optional[str] = None,
                           scopes: Optional[str] = None) -> None:
    DBOS.sql_session.execute(text("""
        INSERT INTO social_connections
            (platform, display_name, api_key_encrypted, username, avatar_url, scopes, updated_at)
        VALUES (:platform, :display_name, :key, :username, :avatar, :scopes, CURRENT_TIMESTAMP)
        ON CONFLICT (platform) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            api_key_encrypted = EXCLUDED.api_key_encrypted,
            username = EXCLUDED.username,
            avatar_url = EXCLUDED.avatar_url,
            scopes = EXCLUDED.scopes,
            status = 'active',
            updated_at = CURRENT_TIMESTAMP
    """), {"platform": platform, "display_name": display_name, "key": api_key_encrypted,
           "username": username, "avatar": avatar_url, "scopes": scopes})


@DBOS.transaction()
def social_get_connection(platform: str) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT * FROM social_connections WHERE platform=:p"
    ), {"p": platform}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def social_list_connections() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT platform, display_name, username, avatar_url, status, scopes, "
        "connected_at, updated_at FROM social_connections ORDER BY connected_at DESC"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def social_delete_connection(platform: str) -> None:
    DBOS.sql_session.execute(text(
        "DELETE FROM social_connections WHERE platform=:p"
    ), {"p": platform})


@DBOS.transaction()
def social_get_api_key(platform: str) -> Optional[str]:
    row = DBOS.sql_session.execute(text(
        "SELECT api_key_encrypted FROM social_connections WHERE platform=:p AND status='active'"
    ), {"p": platform}).fetchone()
    if not row:
        return None
    from github_integration import decrypt_token
    return decrypt_token(row[0])


# ── Agent Run Token Tracking ─────────────────────────────────────────────────

@DBOS.transaction()
def agent_run_record_tokens(run_id: str, agent_id: str, phase: str,
                            model: str, prompt_tokens: int,
                            completion_tokens: int, cost_usd: float) -> None:
    DBOS.sql_session.execute(text(
        "INSERT INTO agent_run_tokens "
        "(run_id, agent_id, phase, model, prompt_tokens, completion_tokens, cost_usd) "
        "VALUES (:rid, :aid, :phase, :model, :pt, :ct, :cost)"
    ), {"rid": run_id, "aid": agent_id, "phase": phase, "model": model,
        "pt": prompt_tokens, "ct": completion_tokens, "cost": cost_usd})


@DBOS.transaction()
def agent_run_total_cost(run_id: str) -> float:
    row = DBOS.sql_session.execute(text(
        "SELECT COALESCE(SUM(cost_usd), 0.0) FROM agent_run_tokens WHERE run_id=:rid"
    ), {"rid": run_id}).fetchone()
    return float(row[0])


@DBOS.transaction()
def agent_run_total_tokens(run_id: str) -> int:
    row = DBOS.sql_session.execute(text(
        "SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) "
        "FROM agent_run_tokens WHERE run_id=:rid"
    ), {"rid": run_id}).fetchone()
    return int(row[0])


# ── Killswitch ───────────────────────────────────────────────────────────────

@DBOS.transaction()
def killswitch_get() -> bool:
    row = DBOS.sql_session.execute(text(
        "SELECT engaged FROM killswitch_state WHERE id=1"
    )).fetchone()
    return bool(row[0]) if row else False


@DBOS.transaction()
def killswitch_get_full_state() -> dict:
    row = DBOS.sql_session.execute(text(
        "SELECT engaged, engaged_at, engaged_by, reason, updated_at "
        "FROM killswitch_state WHERE id=1"
    )).fetchone()
    if not row:
        return {"engaged": False, "engaged_at": None, "engaged_by": None, "reason": None}
    return {
        "engaged": bool(row[0]),
        "engaged_at": row[1],
        "engaged_by": row[2],
        "reason": row[3],
        "updated_at": row[4]
    }


@DBOS.transaction()
def killswitch_set(active: bool, engaged_by: str = "system", reason: Optional[str] = None) -> None:
    engaged_at = datetime.utcnow().isoformat() if active else None
    DBOS.sql_session.execute(text("""
        UPDATE killswitch_state SET 
            engaged = :val,
            engaged_at = :at,
            engaged_by = :by,
            reason = :reason,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
    """), {"val": 1 if active else 0, "at": engaged_at, "by": engaged_by, "reason": reason})
    
    _audit("system", 1, "killswitch_engaged" if active else "killswitch_disengaged", 
           engaged_by, {"reason": reason, "at": engaged_at})


# ── Webhook Events ────────────────────────────────────────────────────────────

@DBOS.transaction()
def webhook_create(source: str, event_type: str, branch: str, payload: dict) -> int:
    return DBOS.sql_session.execute(text(
        "INSERT INTO webhook_events (source, event_type, branch, payload) "
        "VALUES (:src, :etype, :branch, :payload) RETURNING id"
    ), {"src": source, "etype": event_type, "branch": branch,
        "payload": json.dumps(payload)}).scalar()


@DBOS.transaction()
def webhook_update_status(webhook_id: int, status: str, workflow_id: str = "") -> None:
    DBOS.sql_session.execute(text(
        "UPDATE webhook_events SET status=:status, workflow_id=:wid WHERE id=:wid_pk"
    ), {"status": status, "wid": workflow_id, "wid_pk": webhook_id})


# ── Sessions / Workflows / Approvals ─────────────────────────────────────────
# These were previously queried inline in FastAPI route handlers via bare
# DBOS.sql_session calls — which crash because sql_session is only available
# inside a @DBOS.transaction() context. Moved here so each handler gets a
# proper transaction boundary.

@DBOS.transaction()
def sessions_list(limit: int = 100) -> list:
    """Return recent agent runs grouped by run_id, newest first."""
    rows = DBOS.sql_session.execute(text("""
        SELECT
            run_id,
            MIN(agent_id)    AS agent_id,
            MIN(created_at)  AS started_at,
            MAX(created_at)  AS updated_at,
            MAX(step)        AS last_step,
            MAX(status)      AS status,
            COUNT(*)         AS step_count
        FROM agent_runs
        GROUP BY run_id
        ORDER BY MAX(created_at) DESC
        LIMIT :lim
    """), {"lim": limit}).mappings().all()
    return [dict(r) for r in rows]


@DBOS.transaction()
def sessions_get(run_id: str) -> list:
    """Return all steps for a single run_id (empty list if not found)."""
    rows = DBOS.sql_session.execute(text("""
        SELECT id, run_id, agent_id, step, status, created_at
        FROM agent_runs
        WHERE run_id = :run_id
        ORDER BY created_at ASC
    """), {"run_id": run_id}).mappings().all()
    return [dict(r) for r in rows]


@DBOS.transaction()
def workflows_list(run_limit: int = 100, dlq_limit: int = 50) -> dict:
    """Return agent_runs + DLQ events for the Workflows page."""
    runs = DBOS.sql_session.execute(text("""
        SELECT
            run_id,
            MIN(agent_id)   AS agent_id,
            MIN(created_at) AS started_at,
            MAX(created_at) AS updated_at,
            MAX(step)       AS last_step,
            MAX(status)     AS status,
            COUNT(*)        AS step_count
        FROM agent_runs
        GROUP BY run_id
        ORDER BY MAX(created_at) DESC
        LIMIT :lim
    """), {"lim": run_limit}).mappings().all()
    dlq = DBOS.sql_session.execute(text("""
        SELECT id, run_id, agent_id, error, created_at
        FROM dlq_events
        ORDER BY created_at DESC
        LIMIT :lim
    """), {"lim": dlq_limit}).mappings().all()
    return {"workflows": [dict(r) for r in runs], "dlq": [dict(r) for r in dlq]}


@DBOS.transaction()
def workflows_get_last_step(run_id: str) -> Optional[dict]:
    """Return the last step for a run_id (None if not found)."""
    row = DBOS.sql_session.execute(text(
        "SELECT MAX(step) AS last_step FROM agent_runs WHERE run_id = :rid"
    ), {"rid": run_id}).mappings().first()
    return dict(row) if row else None


@DBOS.transaction()
def approvals_list(limit: int = 100) -> list:
    """Return agent_events with event_type approval_required, newest first."""
    rows = DBOS.sql_session.execute(text("""
        SELECT id, tenant_id AS run_id, payload, created_at
        FROM agent_events
        WHERE event_type = 'approval_required'
        ORDER BY created_at DESC
        LIMIT :lim
    """), {"lim": limit}).mappings().all()
    
    now = datetime.utcnow()
    result = []
    for r in rows:
        created_at = r["created_at"]
        if isinstance(created_at, str):
            # Try parsing ISO format
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except ValueError:
                created_at = now # Fallback
        
        # Mark as expired if older than 24h
        is_expired = (now - created_at) > timedelta(hours=24)
        
        try:
            payload = json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"]
        except (json.JSONDecodeError, TypeError):
            payload = {}
        
        # Check if already decided
        decision = DBOS.sql_session.execute(text("""
            SELECT action FROM audit_events 
            WHERE entity_type = 'approval' AND entity_id = :eid
            ORDER BY created_at DESC LIMIT 1
        """), {"eid": str(r["id"])}).mappings().first()
        
        status = "pending"
        if decision:
            status = decision["action"] # 'approved' or 'rejected'
        elif is_expired:
            status = "expired"

        result.append({
            "id": r["id"],
            "run_id": r["run_id"],
            "payload": payload,
            "created_at": r["created_at"],
            "status": status,
            "risk_level": payload.get("risk_level", "medium"),
            "requesting_agent": payload.get("agent_id", "unknown"),
        })
    return result


@DBOS.transaction()
def approval_get_history(approval_id: int) -> list:
    """Return audit history for a specific approval."""
    rows = DBOS.sql_session.execute(text("""
        SELECT action, actor, payload, created_at
        FROM audit_events
        WHERE entity_type = 'approval' AND entity_id = :eid
        ORDER BY created_at ASC
    """), {"eid": str(approval_id)}).mappings().all()
    result = []
    for r in rows:
        try:
            p = json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"]
        except (json.JSONDecodeError, TypeError):
            p = {}
        result.append({
            "action": r["action"],
            "actor": r["actor"],
            "payload": p,
            "created_at": r["created_at"],
        })
    return result


@DBOS.transaction()
def record_approval_decision(approval_id: int, action: str, actor: str, payload: dict) -> None:
    """Record a decision in the audit_events table."""
    _audit_general("approval", str(approval_id), action, actor, payload)


# ── Safety / CriticGate ─────────────────────────────────────────────────────

@DBOS.transaction()
def safety_record_trace(run_id: str, agent_id: str, frame: dict) -> None:
    DBOS.sql_session.execute(text(
        "INSERT INTO safety_trace_frames "
        "(run_id, agent_id, step_index, thought, proposed_action, justification, "
        "dependencies, context_hash, frame_hash) "
        "VALUES (:rid, :aid, :si, :thought, :action, :justification, :deps, :ctx, :fh)"
    ), {
        "rid": run_id, "aid": agent_id,
        "si": frame.get("step_index", 0),
        "thought": frame.get("thought", ""),
        "action": frame.get("proposed_action", ""),
        "justification": frame.get("justification", ""),
        "deps": json.dumps(frame.get("dependencies", [])),
        "ctx": frame.get("context_hash", ""),
        "fh": frame.get("frame_hash", ""),
    })


@DBOS.transaction()
def safety_record_verdict(run_id: str, agent_id: str, verdict: dict) -> int:
    vid = DBOS.sql_session.execute(text(
        "INSERT INTO safety_critic_verdicts "
        "(run_id, agent_id, frame_hash, verdict, confidence, reasoning, "
        "checks, risk_tier, recursion_depth, counterfactual_flag, "
        "critic_model, eval_duration_ms) "
        "VALUES (:rid, :aid, :fh, :verdict, :conf, :reasoning, :checks, "
        ":risk, :depth, :cf, :model, :dur) RETURNING id"
    ), {
        "rid": run_id, "aid": agent_id,
        "fh": verdict.get("frame_hash", ""),
        "verdict": verdict.get("verdict", "FLAG"),
        "conf": verdict.get("confidence", 0.0),
        "reasoning": verdict.get("reasoning", ""),
        "checks": json.dumps(verdict.get("checks", {})),
        "risk": verdict.get("risk_tier", "low"),
        "depth": verdict.get("recursion_depth", 0),
        "cf": 1 if verdict.get("counterfactual_flag") else 0,
        "model": verdict.get("critic_model", ""),
        "dur": verdict.get("eval_duration_ms", 0),
    }).scalar()
    return vid


@DBOS.transaction()
def safety_create_escalation(run_id: str, agent_id: str, frame_hash: str,
                              verdict_id: Optional[int], escalation_type: str) -> int:
    return DBOS.sql_session.execute(text(
        "INSERT INTO safety_escalations "
        "(run_id, agent_id, frame_hash, verdict_id, escalation_type) "
        "VALUES (:rid, :aid, :fh, :vid, :etype) RETURNING id"
    ), {"rid": run_id, "aid": agent_id, "fh": frame_hash,
        "vid": verdict_id, "etype": escalation_type}).scalar()


@DBOS.transaction()
def safety_resolve_escalation(escalation_id: int, resolved_by: str, resolution: str) -> bool:
    row = DBOS.sql_session.execute(
        text("SELECT id FROM safety_escalations WHERE id=:eid"), {"eid": escalation_id}
    ).fetchone()
    if not row:
        return False
    DBOS.sql_session.execute(text(
        "UPDATE safety_escalations SET resolved=1, resolved_by=:by, "
        "resolution=:res, resolved_at=CURRENT_TIMESTAMP WHERE id=:eid"
    ), {"by": resolved_by, "res": resolution, "eid": escalation_id})
    return True


@DBOS.transaction()
def safety_list_verdicts(run_id: Optional[str] = None, limit: int = 100) -> list:
    if run_id:
        rows = DBOS.sql_session.execute(text(
            "SELECT id, run_id, agent_id, frame_hash, verdict, confidence, "
            "reasoning, checks, risk_tier, recursion_depth, counterfactual_flag, "
            "critic_model, eval_duration_ms, created_at "
            "FROM safety_critic_verdicts WHERE run_id=:rid "
            "ORDER BY created_at DESC LIMIT :lim"
        ), {"rid": run_id, "lim": limit}).fetchall()
    else:
        rows = DBOS.sql_session.execute(text(
            "SELECT id, run_id, agent_id, frame_hash, verdict, confidence, "
            "reasoning, checks, risk_tier, recursion_depth, counterfactual_flag, "
            "critic_model, eval_duration_ms, created_at "
            "FROM safety_critic_verdicts "
            "ORDER BY created_at DESC LIMIT :lim"
        ), {"lim": limit}).fetchall()
    result = []
    for r in rows:
        d = dict(r._mapping)
        try:
            d["checks"] = json.loads(d["checks"]) if isinstance(d["checks"], str) else d["checks"]
        except (json.JSONDecodeError, TypeError):
            d["checks"] = {}
        result.append(d)
    return result


@DBOS.transaction()
def safety_list_traces(run_id: str) -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, run_id, agent_id, step_index, thought, proposed_action, "
        "justification, dependencies, context_hash, frame_hash, created_at "
        "FROM safety_trace_frames WHERE run_id=:rid ORDER BY step_index ASC"
    ), {"rid": run_id}).fetchall()
    result = []
    for r in rows:
        d = dict(r._mapping)
        try:
            d["dependencies"] = json.loads(d["dependencies"]) if isinstance(d["dependencies"], str) else d["dependencies"]
        except (json.JSONDecodeError, TypeError):
            d["dependencies"] = []
        result.append(d)
    return result


@DBOS.transaction()
def safety_list_escalations(resolved: Optional[bool] = None, limit: int = 50) -> list:
    if resolved is not None:
        rows = DBOS.sql_session.execute(text(
            "SELECT * FROM safety_escalations WHERE resolved=:r "
            "ORDER BY created_at DESC LIMIT :lim"
        ), {"r": 1 if resolved else 0, "lim": limit}).fetchall()
    else:
        rows = DBOS.sql_session.execute(text(
            "SELECT * FROM safety_escalations ORDER BY created_at DESC LIMIT :lim"
        ), {"lim": limit}).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def safety_stats() -> dict:
    total = DBOS.sql_session.execute(text(
        "SELECT COUNT(*) FROM safety_critic_verdicts"
    )).scalar() or 0
    by_verdict = {}
    for r in DBOS.sql_session.execute(text(
        "SELECT verdict, COUNT(*) as n FROM safety_critic_verdicts GROUP BY verdict"
    )).fetchall():
        by_verdict[r[0]] = r[1]
    by_risk = {}
    for r in DBOS.sql_session.execute(text(
        "SELECT risk_tier, COUNT(*) as n FROM safety_critic_verdicts GROUP BY risk_tier"
    )).fetchall():
        by_risk[r[0]] = r[1]
    avg_confidence = DBOS.sql_session.execute(text(
        "SELECT COALESCE(AVG(confidence), 0.0) FROM safety_critic_verdicts"
    )).scalar()
    avg_duration = DBOS.sql_session.execute(text(
        "SELECT COALESCE(AVG(eval_duration_ms), 0) FROM safety_critic_verdicts"
    )).scalar()
    counterfactual_blocks = DBOS.sql_session.execute(text(
        "SELECT COUNT(*) FROM safety_critic_verdicts WHERE counterfactual_flag=1"
    )).scalar() or 0
    open_escalations = DBOS.sql_session.execute(text(
        "SELECT COUNT(*) FROM safety_escalations WHERE resolved=0"
    )).scalar() or 0
    return {
        "total_evaluations": total,
        "by_verdict": by_verdict,
        "by_risk_tier": by_risk,
        "avg_confidence": round(float(avg_confidence), 3),
        "avg_eval_duration_ms": int(avg_duration),
        "counterfactual_blocks": counterfactual_blocks,
        "open_escalations": open_escalations,
    }


# ── Connections ───────────────────────────────────────────────────────────────

@DBOS.transaction()
def connection_save(id: str, provider_id: str, connector_type: str, config: dict, metadata: dict) -> None:
    DBOS.sql_session.execute(text("""
        INSERT INTO connections (id, provider_id, connector_type, config_encrypted, metadata, updated_at)
        VALUES (:id, :provider, :type, :config, :metadata, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
            provider_id = EXCLUDED.provider_id,
            connector_type = EXCLUDED.connector_type,
            config_encrypted = EXCLUDED.config_encrypted,
            metadata = EXCLUDED.metadata,
            status = 'connected',
            updated_at = CURRENT_TIMESTAMP
    """), {
        "id": id,
        "provider": provider_id,
        "type": connector_type,
        "config": encrypt_token(json.dumps(config)),
        "metadata": json.dumps(metadata)
    })

@DBOS.transaction()
def connection_get(id: str) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT * FROM connections WHERE id=:id"
    ), {"id": id}).fetchone()
    if not row:
        return None
    res = dict(row._mapping)
    res["config"] = json.loads(decrypt_token(res.pop("config_encrypted")))
    res["metadata"] = json.loads(res["metadata"]) if res["metadata"] else {}
    return res

@DBOS.transaction()
def connection_list() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, provider_id, connector_type, metadata, status, created_at, updated_at "
        "FROM connections ORDER BY created_at DESC"
    )).fetchall()
    result = []
    for r in rows:
        d = dict(r._mapping)
        d["metadata"] = json.loads(d["metadata"]) if d["metadata"] else {}
        result.append(d)
    return result

@DBOS.transaction()
def connection_delete(id: str) -> None:
    DBOS.sql_session.execute(text(
        "DELETE FROM connections WHERE id=:id"
    ), {"id": id})

@DBOS.transaction()
def connection_update_status(id: str, status: str) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE connections SET status=:status, updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"id": id, "status": status})


# ── Internal helpers ──────────────────────────────────────────────────────────

def _audit_general(entity_type: str, entity_id: str, action: str,
                   actor: str, payload: dict) -> None:
    """Insert an audit_events row. Must be called from within a @DBOS.transaction()."""
    DBOS.sql_session.execute(text(
        "INSERT INTO audit_events (entity_type, entity_id, action, actor, payload) "
        "VALUES (:etype, :eid, :action, :actor, :payload)"
    ), {"etype": entity_type, "eid": entity_id, "action": action,
        "actor": actor, "payload": json.dumps(payload)})


def _audit(entity_type: str, entity_id: int, action: str,
           actor: str, payload: dict) -> None:
    """Insert a marketing_audit_events row. Must be called from within a @DBOS.transaction()."""
    DBOS.sql_session.execute(text(
        "INSERT INTO marketing_audit_events (entity_type, entity_id, action, actor, payload) "
        "VALUES (:etype, :eid, :action, :actor, :payload)"
    ), {"etype": entity_type, "eid": entity_id, "action": action,
        "actor": actor, "payload": json.dumps(payload)})


# ── Social Studio — Accounts ──────────────────────────────────────────────────

@DBOS.transaction()
def ss_list_accounts() -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, platform, account_id, display_name, username, avatar_url, "
        "follower_count, scopes, status, created_at, updated_at "
        "FROM social_studio_accounts WHERE status='active' ORDER BY platform, display_name"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_get_connected_accounts() -> list:
    """Return all active social accounts. Used by the auto-poster agent."""
    rows = DBOS.sql_session.execute(text(
        "SELECT id, platform, account_id, display_name, username "
        "FROM social_studio_accounts WHERE status='active' ORDER BY platform"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_get_account(account_id: int) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT id, platform, account_id, display_name, username, avatar_url, "
        "follower_count, access_token_encrypted, refresh_token_encrypted, "
        "token_expires_at, scopes, status "
        "FROM social_studio_accounts WHERE id=:id"
    ), {"id": account_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def ss_get_account_token(account_id: int) -> Optional[str]:
    """Return decrypted access token for a connected account."""
    row = DBOS.sql_session.execute(text(
        "SELECT access_token_encrypted FROM social_studio_accounts WHERE id=:id AND status='active'"
    ), {"id": account_id}).fetchone()
    if not row:
        return None
    return decrypt_token(row[0])


@DBOS.transaction()
def ss_connect_account(
    platform: str, account_id: str, display_name: str, username: str,
    avatar_url: Optional[str], follower_count: int,
    access_token: str, refresh_token: Optional[str],
    token_expires_at: Optional[str], scopes: Optional[str],
) -> int:
    """Insert or update a connected social account. Returns the row id."""
    existing = DBOS.sql_session.execute(text(
        "SELECT id FROM social_studio_accounts WHERE platform=:p AND account_id=:aid"
    ), {"p": platform, "aid": account_id}).fetchone()

    enc_access = encrypt_token(access_token)
    enc_refresh = encrypt_token(refresh_token) if refresh_token else None

    if existing:
        DBOS.sql_session.execute(text(
            "UPDATE social_studio_accounts SET display_name=:dn, username=:un, "
            "avatar_url=:av, follower_count=:fc, access_token_encrypted=:at, "
            "refresh_token_encrypted=:rt, token_expires_at=:exp, scopes=:sc, "
            "status='active', updated_at=CURRENT_TIMESTAMP "
            "WHERE id=:id"
        ), {"dn": display_name, "un": username, "av": avatar_url, "fc": follower_count,
            "at": enc_access, "rt": enc_refresh, "exp": token_expires_at, "sc": scopes,
            "id": existing[0]})
        return existing[0]
    else:
        row_id = DBOS.sql_session.execute(text(
            "INSERT INTO social_studio_accounts "
            "(platform, account_id, display_name, username, avatar_url, follower_count, "
            "access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes) "
            "VALUES (:p, :aid, :dn, :un, :av, :fc, :at, :rt, :exp, :sc) RETURNING id"
        ), {"p": platform, "aid": account_id, "dn": display_name, "un": username,
            "av": avatar_url, "fc": follower_count, "at": enc_access,
            "rt": enc_refresh, "exp": token_expires_at, "sc": scopes}).scalar()
        return row_id


@DBOS.transaction()
def ss_disconnect_account(account_id: int) -> bool:
    result = DBOS.sql_session.execute(text(
        "UPDATE social_studio_accounts SET status='disconnected', updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"id": account_id})
    return result.rowcount > 0


@DBOS.transaction()
def ss_update_follower_count(account_id: int, follower_count: int) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE social_studio_accounts SET follower_count=:fc, updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"fc": follower_count, "id": account_id})


# ── Social Studio — Posts ─────────────────────────────────────────────────────

@DBOS.transaction()
def ss_create_posts(run_id: str, topic: str, tone: str, posts: list[dict]) -> list[int]:
    """
    Bulk-insert generated posts for a run. posts is a list of dicts with keys:
    platform, account_id (optional), content, hashtags, char_count, image_url (optional).
    Returns list of inserted row ids.
    """
    # Insert a single parent row
    parent_id = DBOS.sql_session.execute(text(
        "INSERT INTO social_studio_posts "
        "(run_id, platform, content, topic, tone) "
        "VALUES (:run, 'multi', '', :topic, :tone) RETURNING id"
    ), {"run": run_id, "topic": topic, "tone": tone}).scalar()

    # Now insert children
    ids = []
    for p in posts:
        row_id = DBOS.sql_session.execute(text(
            "INSERT INTO ss_platform_posts "
            "(post_id, account_id, platform, caption, hashtags, char_count, status, image_url) "
            "VALUES (:pid, :aid, :plt, :content, :hashtags, :cc, 'draft', :img_url) RETURNING id"
        ), {
            "pid": parent_id,
            "aid": p.get("account_id"),
            "plt": p["platform"],
            "content": p.get("content", ""),
            "hashtags": p.get("hashtags", ""),
            "cc": p.get("char_count", 0),
            "img_url": p.get("image_url"),
        }).scalar()
        ids.append(row_id)
    return ids


@DBOS.transaction()
def ss_list_posts(limit: int = 100, platform: Optional[str] = None,
                  status: Optional[str] = None, run_id: Optional[str] = None) -> list:
    where_clauses = []
    params: dict = {"lim": limit}
    if platform:
        where_clauses.append("platform=:plt")
        params["plt"] = platform
    if status:
        where_clauses.append("status=:status")
        params["status"] = status
    if run_id:
        where_clauses.append("run_id=:run")
        params["run"] = run_id
    where = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    rows = DBOS.sql_session.execute(text(
        f"SELECT id, run_id, platform, account_id, content, hashtags, char_count, "
        f"status, platform_post_id, platform_post_url, scheduled_at, published_at, "
        f"likes, comments, shares, reach, impressions, topic, tone, error, "
        f"created_at, updated_at "
        f"FROM social_studio_posts {where} "
        f"ORDER BY created_at DESC LIMIT :lim"
    ), params).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_get_post(post_id: int) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT id, run_id, platform, account_id, content, hashtags, char_count, "
        "status, platform_post_id, platform_post_url, scheduled_at, published_at, "
        "likes, comments, shares, reach, impressions, topic, tone, error "
        "FROM social_studio_posts WHERE id=:id"
    ), {"id": post_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def ss_update_post_content(post_id: int, content: str) -> bool:
    """Edit content of a draft post."""
    result = DBOS.sql_session.execute(text(
        "UPDATE social_studio_posts SET content=:content, char_count=:cc, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:id AND status='draft'"
    ), {"content": content, "cc": len(content), "id": post_id})
    return result.rowcount > 0


@DBOS.transaction()
def ss_mark_post_published(post_id: int, platform_post_id: str,
                            platform_post_url: Optional[str] = None) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE social_studio_posts SET status='published', platform_post_id=:ppid, "
        "platform_post_url=:purl, published_at=CURRENT_TIMESTAMP, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"ppid": platform_post_id, "purl": platform_post_url, "id": post_id})


@DBOS.transaction()
def ss_mark_post_scheduled(post_id: int, scheduled_at: str) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE social_studio_posts SET status='scheduled', scheduled_at=:sat, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"sat": scheduled_at, "id": post_id})


@DBOS.transaction()
def ss_mark_post_failed(post_id: int, error: str) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE social_studio_posts SET status='failed', error=:err, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"err": error[:500], "id": post_id})


@DBOS.transaction()
def ss_update_post_metrics(post_id: int, likes: int, comments: int,
                            shares: int, reach: int, impressions: int) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE social_studio_posts SET likes=:l, comments=:c, shares=:s, "
        "reach=:r, impressions=:i, updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"l": likes, "c": comments, "s": shares, "r": reach, "i": impressions, "id": post_id})


@DBOS.transaction()
def ss_get_run_posts(run_id: str) -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, platform, content, hashtags, char_count, status, "
        "platform_post_id, platform_post_url, error, topic, tone "
        "FROM social_studio_posts WHERE run_id=:run ORDER BY platform"
    ), {"run": run_id}).fetchall()
    return [dict(r._mapping) for r in rows]


# ── Social Studio — Analytics ─────────────────────────────────────────────────

@DBOS.transaction()
def ss_upsert_analytics(account_id: int, platform: str, snapshot_date: str,
                         followers: int, followers_gained: int, impressions: int,
                         reach: int, engagements: int, posts_count: int,
                         avg_engagement_rate: float) -> None:
    DBOS.sql_session.execute(text(
        "INSERT INTO social_studio_analytics "
        "(account_id, platform, snapshot_date, followers, followers_gained, "
        "impressions, reach, engagements, posts_count, avg_engagement_rate) "
        "VALUES (:aid, :plt, :sd, :f, :fg, :imp, :r, :eng, :pc, :aer) "
        "ON CONFLICT(account_id, snapshot_date) DO UPDATE SET "
        "followers=EXCLUDED.followers, followers_gained=EXCLUDED.followers_gained, "
        "impressions=EXCLUDED.impressions, reach=EXCLUDED.reach, "
        "engagements=EXCLUDED.engagements, posts_count=EXCLUDED.posts_count, "
        "avg_engagement_rate=EXCLUDED.avg_engagement_rate"
    ), {"aid": account_id, "plt": platform, "sd": snapshot_date, "f": followers,
        "fg": followers_gained, "imp": impressions, "r": reach, "eng": engagements,
        "pc": posts_count, "aer": avg_engagement_rate})


@DBOS.transaction()
def ss_list_analytics(days: int = 30) -> list:
    """Return analytics snapshots for all accounts for the last N days."""
    rows = DBOS.sql_session.execute(text(
        "SELECT a.id, a.account_id, a.platform, a.snapshot_date, "
        "a.followers, a.followers_gained, a.impressions, a.reach, "
        "a.engagements, a.posts_count, a.avg_engagement_rate, "
        "acc.display_name, acc.username, acc.avatar_url "
        "FROM social_studio_analytics a "
        "JOIN social_studio_accounts acc ON acc.id=a.account_id "
        "WHERE a.snapshot_date >= date('now', :days) "
        "ORDER BY a.account_id, a.snapshot_date DESC"
    ), {"days": f"-{days} days"}).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_get_account_summary() -> list:
    """Return latest analytics snapshot per account, joined with account info."""
    rows = DBOS.sql_session.execute(text(
        "SELECT acc.id, acc.platform, acc.display_name, acc.username, acc.avatar_url, "
        "acc.follower_count, acc.status, "
        "COALESCE(an.followers_gained, 0) AS followers_gained_7d, "
        "COALESCE(an.impressions, 0) AS impressions_7d, "
        "COALESCE(an.reach, 0) AS reach_7d, "
        "COALESCE(an.engagements, 0) AS engagements_7d, "
        "COALESCE(an.posts_count, 0) AS posts_7d, "
        "COALESCE(an.avg_engagement_rate, 0.0) AS avg_engagement_rate "
        "FROM social_studio_accounts acc "
        "LEFT JOIN social_studio_analytics an ON an.account_id=acc.id "
        "AND an.snapshot_date=( "
        "  SELECT MAX(snapshot_date) FROM social_studio_analytics WHERE account_id=acc.id "
        ") "
        "WHERE acc.status='active' "
        "ORDER BY acc.platform, acc.display_name"
    )).fetchall()
    return [dict(r._mapping) for r in rows]


# ── Social Studio — Platform Posts (state machine) ────────────────────────────

@DBOS.transaction()
def ss_create_platform_posts(run_id: str, posts: list[dict]) -> list[int]:
    """
    Create ss_platform_posts rows linked to a social_studio_posts run.
    posts: list of {platform, account_id, caption, hashtags, char_count, status, publish_error}
    """
    # Resolve or create parent post row
    parent = DBOS.sql_session.execute(text(
        "SELECT id FROM social_studio_posts WHERE run_id=:run LIMIT 1"
    ), {"run": run_id}).fetchone()

    if not parent:
        raise ValueError(f"No parent post found for run_id={run_id}")

    post_id = parent[0]
    ids = []
    for p in posts:
        row_id = DBOS.sql_session.execute(text(
            "INSERT INTO ss_platform_posts "
            "(post_id, account_id, platform, caption, hashtags, char_count, status, publish_error) "
            "VALUES (:pid, :aid, :plt, :cap, :ht, :cc, :st, :err) RETURNING id"
        ), {
            "pid": post_id,
            "aid": p.get("account_id"),
            "plt": p["platform"],
            "cap": p.get("caption", ""),
            "ht": p.get("hashtags", ""),
            "cc": p.get("char_count", 0),
            "st": p.get("status", "draft"),
            "err": p.get("publish_error"),
        }).scalar()
        ids.append(row_id)
    return ids


@DBOS.transaction()
def ss_list_platform_posts(run_id: Optional[str] = None,
                            platform: Optional[str] = None,
                            status: Optional[str] = None,
                            limit: int = 100) -> list:
    clauses, params = [], {"lim": limit}
    if run_id:
        clauses.append("ssp.run_id=:run")
        params["run"] = run_id
    if platform:
        clauses.append("pp.platform=:plt")
        params["plt"] = platform
    if status:
        clauses.append("pp.status=:status")
        params["status"] = status
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = DBOS.sql_session.execute(text(
        f"SELECT pp.id, pp.post_id, pp.account_id, pp.platform, pp.caption, "
        f"pp.hashtags, pp.char_count, pp.status, pp.platform_post_id, "
        f"pp.platform_post_url, pp.publish_error, pp.scheduled_at, pp.published_at, "
        f"pp.retry_count, pp.image_url, ssp.run_id, ssp.topic, ssp.tone "
        f"FROM ss_platform_posts pp "
        f"JOIN social_studio_posts ssp ON ssp.id=pp.post_id "
        f"{where} "
        f"ORDER BY pp.created_at DESC LIMIT :lim"
    ), params).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_get_platform_post(pp_id: int) -> Optional[dict]:
    row = DBOS.sql_session.execute(text(
        "SELECT pp.id, pp.post_id, pp.account_id, pp.platform, pp.caption, "
        "pp.hashtags, pp.char_count, pp.status, pp.platform_post_id, "
        "pp.platform_post_url, pp.publish_error, pp.scheduled_at, pp.published_at, "
        "pp.retry_count, pp.image_url, ssp.run_id, ssp.topic, ssp.tone "
        "FROM ss_platform_posts pp "
        "JOIN social_studio_posts ssp ON ssp.id=pp.post_id "
        "WHERE pp.id=:id"
    ), {"id": pp_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def ss_update_platform_post_caption(pp_id: int, caption: str, hashtags: str = "") -> bool:
    result = DBOS.sql_session.execute(text(
        "UPDATE ss_platform_posts SET caption=:cap, hashtags=:ht, char_count=:cc, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:id AND status='draft'"
    ), {"cap": caption, "ht": hashtags, "cc": len(caption) + len(hashtags), "id": pp_id})
    return result.rowcount > 0


@DBOS.transaction()
def ss_mark_platform_post_published(pp_id: int, ext_post_id: str,
                                     ext_post_url: Optional[str] = None) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE ss_platform_posts SET status='published', platform_post_id=:ppid, "
        "platform_post_url=:purl, published_at=CURRENT_TIMESTAMP, "
        "publish_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"ppid": ext_post_id, "purl": ext_post_url, "id": pp_id})


@DBOS.transaction()
def ss_mark_platform_post_scheduled(pp_id: int, scheduled_at: str) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE ss_platform_posts SET status='scheduled', scheduled_at=:sat, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"sat": scheduled_at, "id": pp_id})


@DBOS.transaction()
def ss_mark_platform_post_failed(pp_id: int, error: str,
                                  retryable: bool = True,
                                  next_retry_at: Optional[str] = None) -> None:
    DBOS.sql_session.execute(text(
        "UPDATE ss_platform_posts SET status='failed', publish_error=:err, "
        "next_retry_at=:nra, updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"err": error[:500], "nra": next_retry_at, "id": pp_id})


@DBOS.transaction()
def ss_get_and_lock_due_posts() -> list:
    now_str = datetime.now(timezone.utc).isoformat()
    rows = DBOS.sql_session.execute(text(
        "SELECT id, post_id, account_id, platform, caption, hashtags "
        "FROM ss_platform_posts "
        "WHERE (status = 'scheduled' AND scheduled_at <= :now) "
        "   OR (status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= :now)"
    ), {"now": now_str}).fetchall()
    
    if rows:
        ids = [r[0] for r in rows]
        id_list = ",".join(str(i) for i in ids)
        DBOS.sql_session.execute(text(
            f"UPDATE ss_platform_posts SET status='publishing', updated_at=CURRENT_TIMESTAMP "
            f"WHERE id IN ({id_list})"
        ))
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_increment_retry(pp_id: int) -> int:
    """Increment retry_count and return new value."""
    DBOS.sql_session.execute(text(
        "UPDATE ss_platform_posts SET retry_count=retry_count+1, "
        "updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"id": pp_id})
    row = DBOS.sql_session.execute(text(
        "SELECT retry_count FROM ss_platform_posts WHERE id=:id"
    ), {"id": pp_id}).fetchone()
    return row[0] if row else 1


# ── Social Studio — Publish Log ───────────────────────────────────────────────

@DBOS.transaction()
def ss_log_publish_attempt(platform_post_id: int, attempt_number: int,
                            status_code: int, response_body: str,
                            error_message: str, duration_ms: int) -> None:
    DBOS.sql_session.execute(text(
        "INSERT INTO ss_publish_log "
        "(platform_post_id, attempt_number, status_code, response_body, error_message, duration_ms) "
        "VALUES (:ppid, :att, :sc, :rb, :em, :dm)"
    ), {
        "ppid": platform_post_id, "att": attempt_number,
        "sc": status_code, "rb": response_body[:1000],
        "em": error_message[:500], "dm": duration_ms,
    })


@DBOS.transaction()
def ss_get_publish_log(platform_post_id: int) -> list:
    rows = DBOS.sql_session.execute(text(
        "SELECT id, attempt_number, status_code, error_message, duration_ms, created_at "
        "FROM ss_publish_log WHERE platform_post_id=:ppid ORDER BY created_at DESC"
    ), {"ppid": platform_post_id}).fetchall()
    return [dict(r._mapping) for r in rows]


# ── Social Studio — Video Upload Tracking ────────────────────────────────────

@DBOS.transaction()
def ss_create_video_upload(
    file_id: str,
    file_path: str,
    file_size: int,
    duration: Optional[int] = None,
    format: Optional[str] = None,
    resolution: Optional[str] = None,
    source: str = "upload",
    veo3_prompt: Optional[str] = None,
) -> dict:
    """Store video upload metadata."""
    DBOS.sql_session.execute(text(
        "INSERT INTO ss_video_uploads "
        "(id, file_path, file_size_bytes, duration_seconds, format, resolution, source, veo3_prompt) "
        "VALUES (:id, :fp, :fs, :dur, :fmt, :res, :src, :prompt)"
    ), {
        "id": file_id,
        "fp": file_path,
        "fs": file_size,
        "dur": duration,
        "fmt": format,
        "res": resolution,
        "src": source,
        "prompt": veo3_prompt,
    })
    return {"file_id": file_id, "file_path": file_path}


@DBOS.transaction()
def ss_get_video_upload(file_id: str) -> Optional[dict]:
    """Retrieve video upload by ID."""
    row = DBOS.sql_session.execute(text(
        "SELECT id, platform_post_id, file_path, file_size_bytes, duration_seconds, "
        "format, resolution, upload_progress_bytes, upload_status, source, veo3_prompt, "
        "created_at, uploaded_at, deleted_at "
        "FROM ss_video_uploads WHERE id=:fid"
    ), {"fid": file_id}).fetchone()
    return dict(row._mapping) if row else None


@DBOS.transaction()
def ss_update_upload_progress(file_id: str, uploaded_bytes: int) -> None:
    """Update upload progress for resumable uploads."""
    DBOS.sql_session.execute(text(
        "UPDATE ss_video_uploads SET upload_progress_bytes=:bytes WHERE id=:fid"
    ), {"bytes": uploaded_bytes, "fid": file_id})


@DBOS.transaction()
def ss_mark_video_uploaded(file_id: str) -> None:
    """Mark video upload complete."""
    DBOS.sql_session.execute(text(
        "UPDATE ss_video_uploads SET upload_status='completed', "
        "uploaded_at=CURRENT_TIMESTAMP WHERE id=:fid"
    ), {"fid": file_id})


@DBOS.transaction()
def ss_create_image_upload(
    file_id: str,
    file_path: str,
    file_size: int,
    width: int,
    height: int,
    format: str = "PNG",
    source: str = "upload",
    prompt: Optional[str] = None,
) -> dict:
    """Store image upload metadata (reuses video uploads table)."""
    DBOS.sql_session.execute(text(
        "INSERT INTO ss_video_uploads "
        "(id, file_path, file_size_bytes, format, resolution, source, veo3_prompt, upload_status) "
        "VALUES (:id, :fp, :fs, :fmt, :res, :src, :prompt, 'completed')"
    ), {
        "id": file_id,
        "fp": file_path,
        "fs": file_size,
        "fmt": format,
        "res": f"{width}x{height}",
        "src": source,
        "prompt": prompt,
    })
    return {"file_id": file_id, "file_path": file_path}


@DBOS.transaction()
def ss_cleanup_old_videos() -> int:
    """Delete video files older than 7 days. Returns count deleted."""
    import os
    from datetime import datetime, timedelta
    
    cutoff = (datetime.now() - timedelta(days=7)).isoformat()
    rows = DBOS.sql_session.execute(text(
        "SELECT id, file_path, thumbnail_file_path FROM ss_video_uploads "
        "WHERE created_at < :cutoff AND deleted_at IS NULL"
    ), {"cutoff": cutoff}).fetchall()
    
    count = 0
    for row in rows:
        file_id = row[0]
        file_path = row[1]
        thumb_path = row[2]
        
        # Delete video file
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                count += 1
            except Exception:
                pass
        
        # Delete thumbnail file
        if thumb_path and os.path.exists(thumb_path):
            try:
                os.remove(thumb_path)
            except Exception:
                pass
        
        # Mark as deleted in database
        DBOS.sql_session.execute(text(
            "UPDATE ss_video_uploads SET deleted_at=CURRENT_TIMESTAMP WHERE id=:fid"
        ), {"fid": file_id})
    
    return count


@DBOS.transaction()
def ss_delete_video_file(file_path: str, thumbnail_path: Optional[str] = None) -> None:
    """Delete video and thumbnail files immediately after successful upload."""
    import os
    
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass
    
    if thumbnail_path and os.path.exists(thumbnail_path):
        try:
            os.remove(thumbnail_path)
        except Exception:
            pass


@DBOS.transaction()
def ss_create_platform_post_with_video(
    post_id: int,
    account_id: int,
    platform: str,
    caption: str,
    hashtags: str,
    video_file_id: str,
    thumbnail_file_id: Optional[str],
    metadata: dict,
) -> int:
    """Create platform_post with video metadata."""
    video_upload = ss_get_video_upload(video_file_id)
    if not video_upload:
        raise ValueError(f"Video upload {video_file_id} not found")
    
    thumbnail_path = None
    if thumbnail_file_id:
        thumb_upload = ss_get_video_upload(thumbnail_file_id)
        if thumb_upload:
            thumbnail_path = thumb_upload["file_path"]
    
    result = DBOS.sql_session.execute(text(
        "INSERT INTO ss_platform_posts "
        "(post_id, account_id, platform, caption, hashtags, char_count, status, "
        "media_type, video_file_path, thumbnail_file_path, video_duration_seconds, "
        "privacy_status, video_category_id, made_for_kids, video_source, veo3_prompt) "
        "VALUES (:pid, :aid, :plat, :cap, :ht, :cc, :st, :mt, :vfp, :tfp, :dur, :priv, :cat, :kd, :src, :prompt) "
        "RETURNING id"
    ), {
        "pid": post_id,
        "aid": account_id,
        "plat": platform,
        "cap": caption,
        "ht": hashtags,
        "cc": len(caption),
        "st": "draft",
        "mt": metadata.get("post_type", "VIDEO"),
        "vfp": video_upload["file_path"],
        "tfp": thumbnail_path,
        "dur": video_upload.get("duration_seconds"),
        "priv": metadata.get("privacy", "public"),
        "cat": metadata.get("category_id", "22"),
        "kd": 1 if metadata.get("made_for_kids") else 0,
        "src": video_upload.get("source", "upload"),
        "prompt": video_upload.get("veo3_prompt"),
    })
    return result.fetchone()[0]


# ── Social Studio — Metric Snapshots ─────────────────────────────────────────

@DBOS.transaction()
def ss_upsert_metric_snapshot(account_id: int, metric_key: str,
                               date: str, value: float) -> None:
    DBOS.sql_session.execute(text(
        "INSERT INTO ss_metric_snapshots (account_id, metric_key, date, value) "
        "VALUES (:aid, :mk, :d, :v) "
        "ON CONFLICT(account_id, metric_key, date) DO UPDATE SET "
        "value=EXCLUDED.value, captured_at=CURRENT_TIMESTAMP"
    ), {"aid": account_id, "mk": metric_key, "d": date, "v": value})


@DBOS.transaction()
def ss_get_account_metrics(account_id: int, metric_keys: list[str],
                            days: int = 30) -> list:
    """Return time-series data for charting."""
    keys_placeholder = ",".join([f":k{i}" for i in range(len(metric_keys))])
    params = {"aid": account_id, "days": f"-{days} days"}
    for i, k in enumerate(metric_keys):
        params[f"k{i}"] = k
    rows = DBOS.sql_session.execute(text(
        f"SELECT metric_key, date, value FROM ss_metric_snapshots "
        f"WHERE account_id=:aid AND metric_key IN ({keys_placeholder}) "
        f"AND date >= date('now', :days) "
        f"ORDER BY metric_key, date ASC"
    ), params).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_get_analytics_summary() -> list:
    """
    Latest snapshot per metric per account — used for the hero KPI cards.
    Returns per-account dict with all latest metric values.
    """
    rows = DBOS.sql_session.execute(text(
        "SELECT acc.id AS account_id, acc.platform, acc.display_name, "
        "acc.username, acc.avatar_url, acc.follower_count, acc.status, "
        "ms.metric_key, ms.value, ms.date "
        "FROM social_studio_accounts acc "
        "LEFT JOIN ss_metric_snapshots ms ON ms.account_id=acc.id "
        "AND ms.date=("
        "  SELECT MAX(date) FROM ss_metric_snapshots "
        "  WHERE account_id=acc.id AND metric_key=ms.metric_key"
        ") "
        "WHERE acc.status='active' "
        "ORDER BY acc.platform, acc.display_name, ms.metric_key"
    )).fetchall()

    # Pivot into per-account dicts
    accounts: dict = {}
    for r in rows:
        d = dict(r._mapping)
        aid = d["account_id"]
        if aid not in accounts:
            accounts[aid] = {
                "id": aid, "platform": d["platform"],
                "display_name": d["display_name"], "username": d["username"],
                "avatar_url": d["avatar_url"], "follower_count": d["follower_count"],
                "status": d["status"], "metrics": {},
            }
        if d["metric_key"]:
            accounts[aid]["metrics"][d["metric_key"]] = {
                "value": d["value"], "date": d["date"]
            }
    return list(accounts.values())


@DBOS.transaction()
def ss_get_top_posts(limit: int = 20) -> list:
    """Published posts ordered by engagement (likes + comments + shares)."""
    rows = DBOS.sql_session.execute(text(
        "SELECT pp.id, pp.platform, pp.caption, pp.platform_post_url, "
        "pp.published_at, pp.platform_post_id, "
        "ssp.topic, acc.display_name AS account_name, acc.username, "
        "COALESCE(m_l.value,0) AS likes, "
        "COALESCE(m_c.value,0) AS comments, "
        "COALESCE(m_s.value,0) AS shares, "
        "COALESCE(m_r.value,0) AS reach, "
        "COALESCE(m_i.value,0) AS impressions "
        "FROM ss_platform_posts pp "
        "JOIN social_studio_posts ssp ON ssp.id=pp.post_id "
        "LEFT JOIN social_studio_accounts acc ON acc.id=pp.account_id "
        "LEFT JOIN ss_post_metrics m_l ON m_l.platform_post_id=pp.id AND m_l.metric_key='likes' "
        "LEFT JOIN ss_post_metrics m_c ON m_c.platform_post_id=pp.id AND m_c.metric_key='comments' "
        "LEFT JOIN ss_post_metrics m_s ON m_s.platform_post_id=pp.id AND m_s.metric_key='shares' "
        "LEFT JOIN ss_post_metrics m_r ON m_r.platform_post_id=pp.id AND m_r.metric_key='reach' "
        "LEFT JOIN ss_post_metrics m_i ON m_i.platform_post_id=pp.id AND m_i.metric_key='impressions' "
        "WHERE pp.status='published' "
        "ORDER BY (COALESCE(m_l.value,0)+COALESCE(m_c.value,0)+COALESCE(m_s.value,0)) DESC "
        "LIMIT :lim"
    ), {"lim": limit}).fetchall()
    return [dict(r._mapping) for r in rows]


@DBOS.transaction()
def ss_get_calendar_posts(year: int, month: int) -> list:
    """Posts scheduled or published in a given month for calendar view."""
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year+1:04d}-01-01"
    else:
        end = f"{year:04d}-{month+1:02d}-01"
    rows = DBOS.sql_session.execute(text(
        "SELECT pp.id, pp.platform, pp.status, pp.caption, "
        "pp.scheduled_at, pp.published_at, pp.platform_post_url, "
        "acc.display_name AS account_name, acc.avatar_url "
        "FROM ss_platform_posts pp "
        "LEFT JOIN social_studio_accounts acc ON acc.id=pp.account_id "
        "WHERE (pp.scheduled_at >= :start AND pp.scheduled_at < :end) "
        "OR (pp.published_at >= :start AND pp.published_at < :end) "
        "ORDER BY COALESCE(pp.scheduled_at, pp.published_at) ASC"
    ), {"start": start, "end": end}).fetchall()
    return [dict(r._mapping) for r in rows]

# ── Ideas ──────────────────────────────────────────────────────────────────────

@DBOS.transaction()
def ss_create_idea(prompt: str, status: str = "todo") -> int:
    res = DBOS.sql_session.execute(text(
        "INSERT INTO ss_ideas (prompt, status) VALUES (:prompt, :status) RETURNING id"
    ), {"prompt": prompt, "status": status})
    return res.scalar()

@DBOS.transaction()
def ss_list_ideas() -> list:
    res = DBOS.sql_session.execute(text(
        "SELECT * FROM ss_ideas ORDER BY created_at DESC"
    )).fetchall()
    return [dict(r._mapping) for r in res]

@DBOS.transaction()
def ss_update_idea_status(idea_id: int, status: str) -> bool:
    res = DBOS.sql_session.execute(text(
        "UPDATE ss_ideas SET status=:status, updated_at=CURRENT_TIMESTAMP WHERE id=:id"
    ), {"status": status, "id": idea_id})
    return res.rowcount > 0

@DBOS.transaction()
def ss_get_ideas_by_status(status: str) -> list:
    res = DBOS.sql_session.execute(text(
        "SELECT * FROM ss_ideas WHERE status=:status ORDER BY created_at ASC"
    ), {"status": status}).fetchall()
    return [dict(r._mapping) for r in res]



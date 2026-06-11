"""
store.py — All DBOS @transaction() functions for business data.

Replaces the sqlite3 _db() pattern in api.py. Every table lives in the
same Postgres database as DBOS execution state, so workflow writes and
API reads are always in sync.
"""
import json
from datetime import datetime, timedelta
from typing import Optional

from dbos import DBOS
from sqlalchemy import text

from github_integration import (
    GitHubConfigurationError,
    decrypt_token,
    encrypt_token,
)

_INTERVALS = {"hourly": 3600, "daily": 86400, "weekly": 604800, "monthly": 2592000}


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
        "SELECT value FROM app_settings WHERE key='killswitch'"
    )).fetchone()
    return row[0] == "1" if row else False


@DBOS.transaction()
def killswitch_set(active: bool) -> None:
    val = "1" if active else "0"
    DBOS.sql_session.execute(text("""
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('killswitch', :val, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at
    """), {"val": val})


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
    result = []
    for r in rows:
        try:
            payload = json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"]
        except (json.JSONDecodeError, TypeError):
            payload = {}
        result.append({
            "id": r["id"],
            "run_id": r["run_id"],
            "payload": payload,
            "created_at": r["created_at"],
        })
    return result


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


# ── Internal helpers ──────────────────────────────────────────────────────────

def _audit(entity_type: str, entity_id: int, action: str,
           actor: str, payload: dict) -> None:
    """Insert a marketing_audit_events row. Must be called from within a @DBOS.transaction()."""
    DBOS.sql_session.execute(text(
        "INSERT INTO marketing_audit_events (entity_type, entity_id, action, actor, payload) "
        "VALUES (:etype, :eid, :action, :actor, :payload)"
    ), {"etype": entity_type, "eid": entity_id, "action": action,
        "actor": actor, "payload": json.dumps(payload)})

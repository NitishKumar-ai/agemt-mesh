import streamlit as st
import psycopg2
import os
import pandas as pd
from streamlit_autorefresh import st_autorefresh

# Configure the page
st.set_page_config(
    page_title="Agent Mesh | Mission Control", 
    page_icon="🌌", 
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for Mission Control styling
st.markdown("""
<style>
    /* Global styling overrides */
    .stApp {
        background-color: #0E1117;
        color: #FAFAFA;
    }
    
    /* Metric Cards */
    div[data-testid="metric-container"] {
        background-color: #1E2127;
        border: 1px solid #333;
        padding: 5% 5% 5% 10%;
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    
    /* Header styling */
    h1 {
        font-family: 'Courier New', Courier, monospace;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: #00FFCC;
    }
    h2, h3 {
        font-family: 'Courier New', Courier, monospace;
        color: #A0B0C0;
    }
</style>
""", unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.image("https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/1200px-Python-logo-notext.svg.png", width=50)
    st.subheader("System Status")
    
    # Auto-refresh interval config
    refresh_rate = st.slider("Refresh Rate (s)", min_value=1, max_value=10, value=2)
    st_autorefresh(interval=refresh_rate * 1000, key="datarefresh")
    
    st.markdown("---")
    st.caption("Agent Mesh Version: 0.1.0")

# Main Header
st.title("🛰️ Mission Control")

@st.cache_data(ttl=1)
def fetch_dashboard_data():
    conn = None
    try:
        conn = psycopg2.connect(
            host=os.getenv("PGHOST", "127.0.0.1"),
            port=os.getenv("PGPORT", "5432"),
            user=os.getenv("PGUSER", "postgres"),
            password=os.getenv("PGPASSWORD", "dbos"),
            dbname=os.getenv("PGDATABASE", "agent_mesh")
        )
        with conn.cursor() as cur:
            # Metrics
            cur.execute("""
                WITH latest_runs AS (
                    SELECT DISTINCT ON (run_id) run_id, status 
                    FROM agent_runs 
                    ORDER BY run_id, created_at DESC
                )
                SELECT 
                    COUNT(*) as total_runs,
                    COALESCE(SUM(CASE WHEN status IN ('running', 'pending') THEN 1 ELSE 0 END), 0) as active_runs,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed_runs,
                    COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed_runs
                FROM latest_runs;
            """)
            metrics = cur.fetchone()
            
            # Feed
            cur.execute("SELECT run_id, step, status, created_at FROM agent_runs ORDER BY created_at DESC LIMIT 100")
            rows = cur.fetchall()
            
            return {"metrics": metrics, "rows": rows, "error": None}
    except psycopg2.errors.UndefinedTable:
        return {"error": "TABLE_NOT_FOUND"}
    except psycopg2.OperationalError:
        return {"error": "CONN_FAILED"}
    finally:
        if conn is not None:
            conn.close()

data = fetch_dashboard_data()

if data.get("error") == "CONN_FAILED":
    st.error("🚨 POSTGRES CONNECTION FAILED")
    st.warning("Waiting for Postgres container... Did you run `docker-compose up -d`?")
    st.stop()
elif data.get("error") == "TABLE_NOT_FOUND":
    st.error("🚨 TABLE 'agent_runs' NOT FOUND")
    st.info("Database initialized, but agent hasn't started yet. Run `python demo.py` to create the state table.")
    st.stop()

metrics = data["metrics"]
rows = data["rows"]

if not rows:
    st.info("Awaiting telemetry... No agent runs detected yet.")
    st.code("python demo.py", language="bash")
else:
    # Metrics Section
    col1, col2, col3, col4 = st.columns(4)
    total_runs = metrics[0] if metrics else 0
    active_runs = metrics[1] if metrics else 0
    completed_runs = metrics[2] if metrics else 0
    failed_runs = metrics[3] if metrics else 0
    
    col1.metric("TOTAL RUNS", total_runs)
    col2.metric("ACTIVE", active_runs)
    col3.metric("COMPLETED", completed_runs)
    col4.metric("FAILED", failed_runs)
    
    st.markdown("### 📡 Live Telemetry Feed")
    
    df = pd.DataFrame(rows, columns=["Run ID", "Step", "Status", "Timestamp"])
    
    # Function to apply color to status
    def color_status(val):
        color = '#A0B0C0'
        if val == 'completed': color = '#00FFCC'
        elif val == 'failed': color = '#FF3366'
        elif val == 'running': color = '#FFCC00'
        return f'color: {color}; font-weight: bold;'
    
    # Display DataFrame
    styled_df = df.style.map(color_status, subset=['Status'])
    st.dataframe(styled_df, use_container_width=True, hide_index=True)

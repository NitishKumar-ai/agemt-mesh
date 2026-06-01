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

@st.cache_resource(ttl=5)
def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv("PGHOST", "127.0.0.1"),
            port=os.getenv("PGPORT", "5432"),
            user=os.getenv("PGUSER", "postgres"),
            password=os.getenv("PGPASSWORD", "dbos"),
            dbname=os.getenv("PGDATABASE", "agent_mesh")
        )
        return conn
    except psycopg2.OperationalError:
        return None

conn = get_db_connection()

if conn is None:
    st.error("🚨 POSTGRES CONNECTION FAILED")
    st.warning("Waiting for Postgres container... Did you run `docker-compose up -d`?")
    st.stop()

# Dashboard Data Fetching
with conn.cursor() as cur:
    try:
        cur.execute("SELECT run_id, step, status FROM agent_runs ORDER BY run_id DESC LIMIT 100")
        rows = cur.fetchall()
        
        if not rows:
            st.info("Awaiting telemetry... No agent runs detected yet.")
            st.code("python demo.py", language="bash")
        else:
            df = pd.DataFrame(rows, columns=["Run ID", "Step", "Status"])
            
            # Metrics Section
            col1, col2, col3, col4 = st.columns(4)
            total_runs = df['Run ID'].nunique()
            active_runs = len(df[df['Status'].isin(['running', 'pending'])])
            completed_runs = len(df[df['Status'] == 'completed'])
            failed_runs = len(df[df['Status'] == 'failed'])
            
            col1.metric("TOTAL RUNS", total_runs)
            col2.metric("ACTIVE", active_runs)
            col3.metric("COMPLETED", completed_runs)
            col4.metric("FAILED", failed_runs)
            
            st.markdown("### 📡 Live Telemetry Feed")
            
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
            
    except psycopg2.errors.UndefinedTable:
        st.error("🚨 TABLE 'agent_runs' NOT FOUND")
        st.info("Database initialized, but agent hasn't started yet. Run `python demo.py` to create the state table.")

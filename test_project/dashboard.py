import streamlit as st
import psycopg2
import os
from time import sleep

st.set_page_config(page_title="Agent Mesh Dashboard", page_icon="🤖", layout="wide")

st.title("Mission Control: Agent Mesh")

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
    st.warning("⏳ Waiting for Postgres container... Did you run `docker-compose up -d`?")
    st.stop()

# Auto-refresh
import streamlit_autorefresh
streamlit_autorefresh.st_autorefresh(interval=1000, key="datarefresh")

with conn.cursor() as cur:
    try:
        cur.execute("SELECT run_id, step, status FROM agent_runs ORDER BY run_id DESC LIMIT 50")
        rows = cur.fetchall()
        if not rows:
            st.info("No agent runs yet. Run `python demo.py` to start.")
        else:
            st.table([{"Run ID": r[0], "Step": r[1], "Status": r[2]} for r in rows])
    except psycopg2.errors.UndefinedTable:
        st.info("Database initialized, but agent hasn't started yet. Run `python demo.py` to create the state table.")

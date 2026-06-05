import sqlite3

def run():
    conn = sqlite3.connect('agent_mesh.sqlite')
    conn.execute("CREATE TABLE IF NOT EXISTS dlq_events (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, agent_id TEXT, error TEXT, payload TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    run()

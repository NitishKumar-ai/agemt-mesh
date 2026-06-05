import os
import sys
from dbos import DBOS
from main import agent_loop, init_db

if __name__ == "__main__":
    if not os.path.exists(".env"):
        print("Error: .env file not found. Did you forget to rename .env.example?")
        sys.exit(1)

    DBOS.launch()
    init_db()

    print("Starting demo agent loop...")
    result = agent_loop("Research quantum computing.")
    print(f"Final result: {result}")

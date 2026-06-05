import os
import shutil
import typer
from rich.console import Console
from rich.prompt import Confirm
from pathlib import Path

app = typer.Typer(help="Agent Mesh OS CLI")
console = Console()

TEMPLATE_DIR = Path(__file__).parent / "templates"

@app.command()
def version():
    """Print version."""
    console.print("agent-mesh version 0.1.0")

@app.command()
def init(
    with_observability: bool = typer.Option(False, "--with-observability", help="Include LLM observability stub (logging)")
):
    """Initialize a local Agent Mesh DBOS environment (TTHW < 1 min)"""
    console.print("[bold cyan]Initializing Agent Mesh OS...[/bold cyan]")
    
    target_dir = Path.cwd()
    
    # Comprehensive Collision check
    collisions = [
        "main.py", "docker-compose.yml", "requirements.txt", 
        "demo.py", ".env.example", ".cursorrules", 
        "api.py", "dashboard.html", "tests/test_agent.py", "agent-mesh.service",
        "README.md", "Makefile"
    ]
    existing_files = [f for f in collisions if (target_dir / f).exists()]
    if existing_files:
        console.print(f"[bold yellow]Warning:[/bold yellow] Found existing files: {', '.join(existing_files)}")
        if not Confirm.ask("Overwrite existing files?"):
            console.print("[red]Aborted.[/red]")
            raise typer.Abort()

    try:
        with console.status("[bold green]Scaffolding DBOS project...[/bold green]"):
            for f in collisions:
                src = TEMPLATE_DIR / f
                if src.exists():
                    os.makedirs((target_dir / f).parent, exist_ok=True)
                    shutil.copy(src, target_dir / f)

            # DBOS Config for local SQLite/Postgres
            dbos_config = """
name: agent-mesh
database:
  hostname: localhost
  port: 5432
  username: postgres
  password: ${PGPASSWORD}
  app_db_name: agent_mesh
"""
            (target_dir / "dbos-config.yaml").write_text(dbos_config)

        console.print("\n[bold green]✅ Agent Mesh project scaffolded successfully![/bold green]")
        console.print("\n[bold]Time to Hello World (TTHW) < 2 mins![/bold]")
        console.print("\n[bold]Next steps:[/bold]")
        console.print("  1. mv .env.example .env")
        console.print("  2. pip install -r requirements.txt")
        console.print("  3. DBOS Postgres Setup: docker run --name dbos-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres")
        console.print("  4. uvicorn api:app --reload  # Run dashboard")
        console.print("\n[cyan]Mission control ready. Happy building![/cyan]")

    except Exception as e:
        console.print(f"\n[bold red]Unexpected error during scaffolding: {e}[/bold red]")
        raise typer.Abort()

if __name__ == "__main__":
    app()

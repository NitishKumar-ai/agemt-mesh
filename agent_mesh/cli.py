import os
import shutil
import typer
from rich.console import Console
from rich.prompt import Confirm
from pathlib import Path

app = typer.Typer(help="Agent Mesh CLI Starter Kit")
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
    console.print("[bold cyan]Initializing Agent Mesh OS...[/bold cyan]")
    
    target_dir = Path.cwd()
    
    # Comprehensive Collision check
    collisions = [
        "main.py", "docker-compose.yml", "requirements.txt", 
        "demo.py", ".env.example", ".cursorrules", 
        "api.py", "dashboard.html", "tests/test_agent.py", "agent-mesh.service"
    ]
    existing_files = [f for f in collisions if (target_dir / f).exists()]
    if existing_files:
        console.print(f"[bold yellow]Warning:[/bold yellow] Found existing files: {', '.join(existing_files)}")
        if not Confirm.ask("Overwrite existing files?"):
            console.print("[red]Aborted.[/red]")
            raise typer.Abort()

    try:
        with console.status("[bold green]Scaffolding DBOS project...[/bold green]"):
            # Copy standard files
            shutil.copy(TEMPLATE_DIR / "docker-compose.yml", target_dir / "docker-compose.yml")
            shutil.copy(TEMPLATE_DIR / ".env.example", target_dir / ".env.example")
            shutil.copy(TEMPLATE_DIR / "demo.py", target_dir / "demo.py")
            shutil.copy(TEMPLATE_DIR / ".cursorrules", target_dir / ".cursorrules")
            shutil.copy(TEMPLATE_DIR / "agent-mesh.service", target_dir / "agent-mesh.service")
            
            shutil.copy(TEMPLATE_DIR / "api.py", target_dir / "api.py")
            shutil.copy(TEMPLATE_DIR / "dashboard.html", target_dir / "dashboard.html")
            
            # Tests
            os.makedirs(target_dir / "tests", exist_ok=True)
            shutil.copy(TEMPLATE_DIR / "tests" / "test_agent.py", target_dir / "tests" / "test_agent.py")

            # Dynamic requirements
            reqs = (TEMPLATE_DIR / "requirements.txt").read_text()
            (target_dir / "requirements.txt").write_text(reqs)

            # Dynamic main.py
            main_py = (TEMPLATE_DIR / "main.py").read_text()
            if with_observability:
                import_marker = "from dbos import DBOS"
                if import_marker in main_py:
                    main_py = main_py.replace(import_marker, import_marker + '\n\nprint("Observability enabled: Logging all LLM prompts to console.")\n')
                else:
                    main_py += '\nprint("Observability enabled: Logging all LLM prompts to console.")\n'
            (target_dir / "main.py").write_text(main_py)

        console.print("\n[bold green]✅ Agent Mesh project scaffolded successfully![/bold green]")
        console.print("\n[bold]Next steps:[/bold]")
        console.print("  1. mv .env.example .env")
        console.print("  2. docker-compose up -d")
        console.print("  3. pip install -r requirements.txt")
        console.print("  4. python demo.py  # Run CLI demo")
        console.print("  5. uvicorn api:app --reload  # Run web dashboard")
        console.print("\n[cyan]Mission control ready. Happy building![/cyan]")

    except PermissionError as e:
        console.print(f"\n[bold red]Permission error during scaffolding: {e}[/bold red]")
        raise typer.Abort()
    except Exception as e:
        console.print(f"\n[bold red]Unexpected error during scaffolding: {e}[/bold red]")
        raise typer.Abort()

if __name__ == "__main__":
    app()

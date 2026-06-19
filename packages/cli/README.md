# Nuzo CLI

The Nuzo CLI gives users direct control over local, auditable memory for AI
agents.

The public command is:

```bash
nuzo memory
```

Core workflows:

```bash
nuzo memory init
nuzo memory remember "The demo project uses SQLite." --kind project_decision
nuzo memory recall "SQLite"
nuzo memory list
nuzo memory doctor
```

Memory is stored locally under `~/.nuzo/memory/` by default. Nuzo does not use
telemetry or network access by default.

Documentation: https://nuzo.com.br

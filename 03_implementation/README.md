# Implementation (03)

Implementation has started in `orbio-guard/`. The current scaffold includes validated
configuration, OAuth metadata discovery, an unauthenticated MCP probe, a typed six-tool
Orbio boundary, credential redaction, and initial unit tests.

Start with `implementation-orbio.md`, which contains the full phased implementation
plan, guides, test strategy, quality gates, seven-day schedule, and release checklist.
The original high-level architecture remains in `../02_concept/architecture-mvp.md`.

When scaffolding:
- Keep the app in `orbio-guard/` so the whole project folder stays self-contained.
- Keep build config/deps inside `03_implementation/orbio-guard/` (package.json,
  tsconfig, etc.) so the folder can be moved as one unit.
- Add architecture/decision notes to `../02_concept/` as the build evolves.

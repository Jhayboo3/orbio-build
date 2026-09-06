# Implementation (03)

Implementation has **not started** (research complete). This folder is reserved for
the build scaffold.

Start with `implementation-orbio.md`, which contains the full phased implementation
plan, guides, test strategy, quality gates, seven-day schedule, and release checklist.
The original high-level architecture remains in `../02_concept/architecture-mvp.md`.

When scaffolding:
- Create the app here (e.g., `orbio-guard/`) so the whole `orbio build` folder stays
  self-contained.
- Keep build config/deps inside `03_implementation/orbio-guard/` (package.json,
  tsconfig, etc.) so the folder can be moved as one unit.
- Add architecture/decision notes to `../02_concept/` as the build evolves.

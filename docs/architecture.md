# CoWork OS Reference (Starter)

This is a minimal starter version of the architecture reference.

## What CoWork OS Is

CoWork OS is a local-first desktop runtime for running AI-assisted tasks with file, shell, web, browser automation, messaging, and integration tools.

## Core Architecture

- Electron main process: orchestration, task runtime, and tool execution
- React renderer: desktop UI and task timeline
- Tool registry: file, shell, web, browser, and integration capabilities
- Local workspace memory: `.cowork/` notes, routines, scratchpads, and signals

## Current Workspace Notes

- Routine-prep artifacts live under `.cowork/routines/`
- Shared operating context lives in `.cowork/PRIORITIES.md`, `.cowork/MISTAKES.md`, and `.cowork/CROSS_SIGNALS.md`
- Current routine context being prepared: Frequently active in WhatsApp

## Repo Landmarks

- `src/electron/`
- `src/renderer/`
- `docs/`
- `.cowork/`

## Update Rule

If behavior, defaults, capabilities, or architecture change, update this file in the same PR.

This is starter content and can be expanded later.

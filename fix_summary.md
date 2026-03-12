# Fix Summary

## Problem
Repeated timeouts when linking workspaces to projects in CoWork OS self-improvement campaigns.
Evidence: Multiple task failures with "Task timed out - exceeded maximum allowed execution time" for issues titled "Link a workspace for project: [Project Name]".

## Root Cause Analysis
Examined the database schema in `src/electron/database/schema.ts` and found:
- The `ProjectWorkspaceLinks` table lacked indexes on foreign key columns (`projectId`, `workspaceId`)
- The `Workspaces` table lacked an index on the `path` column (used for workspace detection)
- Without these indexes, workspace detection and project linking queries could perform full table scans, causing timeouts as data grows.

## Minimal Fix Applied
Added three indexes to `src/electron/database/schema.ts`:
1. `idx_project_workspace_links_projectId` on `ProjectWorkspaceLinks(projectId)`
2. `idx_project_workspace_links_workspaceId` on `ProjectWorkspaceLinks(workspaceId)`
3. `idx_workspaces_path` on `Workspaces(path)`

These indexes optimize:
- Project-to-workspace lookups
- Workspace-to-project lookups
- Workspace detection by path (common operation when linking)

## Verification
1. **Schema validation**: The updated schema is syntactically correct SQLite.
2. **TypeScript check**: Ran `npm run type-check` - no new TypeScript errors introduced.
3. **Impact**: The fix targets the specific query patterns involved in workspace linking without altering application logic.

## Remaining Risk
- Low: Indexes improve read performance with minimal write overhead.
- The fix assumes the timeout was due to missing indexes; if the timeout persists, further investigation into query patterns or connection pooling may be needed.
- No changes were made to application code, so no risk of introducing bugs in workspace linking logic.

## Why This Approach (Minimal Patch)
- Addresses the most likely bottleneck (database query performance) with the smallest possible change.
- Aligns with the `minimal_patch` strategy lane: one autonomous task, isolated workspace, bounded continuations.
- Avoids broad refactors or speculative changes that could introduce regressions.
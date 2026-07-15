# Succession Planner — TA Team Guide

One HTML file, one CSV. No install, no server, no accounts.

## Getting started

1. Put `succession_planner.html` and your CSV (start from `succession_data.csv`)
   anywhere — a shared drive works fine.
2. Open `succession_planner.html` in Chrome or Edge.
3. Click **Open CSV** and pick the database file (you can also just drag the .csv
   onto the window).
4. Work the boards. Click **Save** (or `Ctrl+S`) to write changes straight back to
   the same CSV file. **Export** downloads a copy instead.

The header shows the loaded file and an **Unsaved changes** dot whenever there is
work that hasn't been written to the CSV yet. The app also keeps a local auto-backup
as you work — if the browser closes unexpectedly, you'll be offered a one-click
restore next time it opens.

## The tabs

- **Org Tree** — the reporting-line chart. Click any role to open it.
- **All Roles / your boards** — the working boards, grouped by level. Drag
  candidates from the Candidate Box onto roles; drag slate rows to re-prioritize.
  Tabs are yours to manage (the **+** tab or ⋯ → *Manage tabs*).
- **Candidates** — every person, stored once by Person ID. Edits update every
  slate that references them.
- **Insights** — bench coverage, Ready-Now coverage, vacancies, and the roles
  that need attention. The filter bar applies here too.
- **Rules** — the guardrails. Flip a rule on/off right in the list.
- **History** — the audit trail, saved inside the CSV.

## Working a slate

Each candidate row on a role card has: **↑ ↓** priority, **⚡ Auto** (move now if
the role is vacant, otherwise queue for when it becomes vacant), **✓ Approve**
(make them the incumbent — their old role is vacated and backfill automation
runs), and **✕ Remove**. **Approve Top** approves the #1 candidate.

## Rules

Three kinds, editable in plain language:

- **Candidate field rule** — e.g. *readiness not equal to Ready Now → Block*.
  Conditions support equal / not equal / contains / does not contain / any-of
  (checkbox list), and you can stack several conditions (all must match).
- **Block a person's move** — a specific person cannot move to a specific role,
  or cannot change role at all.
- **Auto backfill** — when a role becomes vacant, pull in the top-ranked slate
  candidate of a chosen type, or use an explicit role → person chart.

Severity **Block** stops the move; **Needs Review** lets it through with a
warning. Priority: Block/field rules → Auto backfill → Auto-move queue.

Every dropdown in the app accepts **+ Add value…** — new values are saved in the
CSV and become available everywhere, including rule builders and filters.

## Safety

**Undo** (or `Ctrl+Z`) steps back through the last 40 changes. ⋯ → *Reset org
changes* returns roles and slates to the state of the last CSV import while
keeping new people, roles and rules. Deletes always ask first.

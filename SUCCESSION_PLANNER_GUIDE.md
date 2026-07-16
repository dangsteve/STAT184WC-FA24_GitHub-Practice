# Succession Planner — TA Team Guide

One HTML file, one CSV. No install, no server, no accounts.

## Getting started

1. Put `succession_planner.html` and your CSV anywhere — a shared drive works
   fine. Two datasets are included: **`succession_demo.csv`** (small — ideal for
   demos and learning; see `DEMO_SCRIPT.md` for a 5-minute walkthrough) and
   **`succession_data.csv`** (full-size test data).
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

## The Chess Board (♞ on every role card)

Press **♞ Board** on any role (or *Chess View* inside the role) for a full-screen
succession board:

- The **King** at the top is the current incumbent. An empty throne means the
  role is vacant.
- Candidates appear as pieces in line: **Queen** (1st), **Rook**, **Bishop**,
  **Knight**, then **Pawns**.
- **Drag one piece onto another to swap places** — the people trade positions
  (and pieces).
- **Drag a piece onto the throne to take the seat.** The old incumbent steps
  down; if the new person holds another role, you'll see a callout that saving
  leaves it vacant (backfill rules and the auto-move queue run as usual).
- **Piece Bank** (right side): everyone who isn't on this slate yet, with
  search. Drag a bank piece onto another piece to take that exact spot (others
  shift down), onto the open board to join last in line, or straight onto the
  throne. Staged pieces show a green **New** badge and can be removed before
  saving.
- **Nothing happens until you press Save.** Rules still apply — a blocked
  candidate shows a red callout and Save refuses. Close discards after asking.
- **Fields shown** picks which details appear under every piece at once (one
  set of checkboxes, no per-piece fiddling). **Make default for all boards**
  saves that choice into the CSV for the whole program.

## Working a slate

Each candidate row on a role card has: **↑ ↓** priority, **⚡ Auto** (move now if
the role is vacant, otherwise queue for when it becomes vacant), **✓ Approve**
(make them the incumbent — their old role is vacated and backfill automation
runs), and **✕ Remove**. **Approve Top** approves the #1 candidate.

## Rules

Three kinds, editable in plain language:

- **Candidate eligibility rule** — spells out who *is allowed* to move, e.g.
  *readiness equal to Ready Now*: candidates who meet every requirement move
  freely; anyone who doesn't is blocked (or flagged, depending on severity).
  Requirements support equal / not equal / contains / does not contain /
  any-of (checkbox list), and you can stack several (all must be met).
- **Block a person's move** — a specific person cannot move to a specific role,
  or cannot change role at all.
- **Auto backfill** — when a role becomes vacant, pull in the top-ranked slate
  candidate of a chosen type, or use an explicit role → person chart.

Severity **Block** stops the move; **Needs Review** lets it through with a
warning. Priority: Block/field rules → Auto backfill → Auto-move queue.

Every dropdown in the app accepts **+ Add value…** — new values are saved in the
CSV and become available everywhere, including rule builders and filters.

## Your CSV grows with you

- **Need a new column?** Open any person or role and use **Additional Fields →
  + Add field** — it becomes a real CSV column on save and appears on every
  record from then on. Columns typed straight into the CSV are kept and shown
  too; the app never throws away a column it doesn't recognize.
- **New tab from the CSV:** just give a ROLE row a `boardId` (e.g.
  `BOARD-TALENT-POOL`) — the tab is created automatically with a readable name.
- **Hierarchy without hand-wiring:** leave `managerRoleId` blank and the Org
  Tree places roles like a family tree by level within their department (an SVP
  sits above the VPs, and so on), shown dashed. One click on **Apply inferred
  lines** makes those reporting lines permanent.
- **Starting fresh?** ⋯ → *Download starter template* gives you a small example
  CSV with one row of each type to copy from.

## Safety

**Undo** (or `Ctrl+Z`) steps back through the last 40 changes. ⋯ → *Reset org
changes* returns roles and slates to the state of the last CSV import while
keeping new people, roles and rules. Deletes always ask first.

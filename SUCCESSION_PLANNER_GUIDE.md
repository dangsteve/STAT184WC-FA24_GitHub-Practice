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
work that hasn't been written to the CSV yet.

**The app remembers where you left off.** Next time it opens, your last session
is restored automatically from a browser-side backup (unsaved work included and
flagged), and a banner offers to **reconnect your database file** — one click
reloads its latest contents (including edits made directly in Excel) and turns
Save back into a one-click overwrite of that file. Open a different CSV and the
app switches to it. The browser backup is a crash safety net on that computer
only — the CSV file is always the real database, so keep saving.

## The tabs

- **Org Tree** — the reporting-line chart on a full-page canvas. It opens
  fitted and centered; scroll to zoom, hold and drag to move around (like
  Lucidchart), click any role to open it, and use the + / − / Fit buttons in
  the corner.
- **All Roles / your boards** — the working boards, grouped by level. Drag
  candidates from the Candidate Box onto roles; drag slate rows to re-prioritize.
  Tabs are yours to manage (the **+** tab or ⋯ → *Manage tabs*).
- **Candidates** — every person, stored once by Person ID. Edits update every
  slate that references them.
- **Insights** — bench coverage, Ready-Now coverage, vacancies, and the roles
  that need attention (the filter bar applies to these), plus **My Dashboard**:
  up to 8 widgets of your own — a count or % with an optional filter ("roles
  where risk equals High"), a sum or average of a Number field, or a **bar,
  pie or donut** breakdown by any field. **+ Add widget** builds one in a few
  clicks, ✕ removes it, and widgets are saved in the CSV so the whole team
  sees them.
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
- **Jump between boards** without leaving the chess view: the bar at the bottom
  has a role dropdown (grouped by board, with candidate counts and VACANT
  flags) plus Prev / Next arrows. Unsaved moves ask before being discarded.
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
  **Applies To Roles** decides where the rule counts: it defaults to *All
  roles*, or switch to *Only selected roles…* and tick exactly the roles it
  should guard (a filter box and "select all shown" make big lists quick).
  The rule list spells the scope out in plain words.
- **Block a person's move** — a specific person cannot move into the **target
  roles you tick** (one or many — same checkbox picker), or cannot change role
  at all.
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
- **Prefer Excel tabs?** Keep a workbook with *People*, *Roles* and *Candidates*
  tabs (⋯ → *Download simple sheet templates* gives you the three layouts —
  friendly headers, names instead of IDs are fine). Save each tab as CSV and
  drag them all onto the app together (or ⋯ → *Import sheets (merge)*). You get
  an **Import Review** first — how many rows are new vs. updated, every problem
  listed with what was done about it, and a **downloadable error report** for
  rows that were skipped (e.g. a candidate whose name isn't in People). The
  review also shows a **Changes list**: every single change the import wants to
  make, as *old value → new value*. **Uncheck** any row to skip just that change
  (skipping a new person also drops their staged slate rows, so nothing is left
  dangling), or **type over the incoming value** right in the list — your edit
  is what gets applied, and typed fields still validate. Incoming values win and
  nothing is ever deleted. Nothing touches the database until you press
  **Apply Import**, and it merges into your current file — rules, tabs and
  everything else stay put. Sheets can be up to **25,000 rows** each (files up
  to 50 MB for CSV, 20 MB for Excel) — a 25,000-row sheet imports in under a
  second.
- **Real Excel files work too.** ⋯ → *Export Excel workbook (.xlsx)* writes a
  workbook with People / Roles / Candidates / Boards tabs (plus a view-only
  Rules tab) — nice for reading and for HR to edit. Bring it back with
  ⋯ → *Import & merge* or just drag the .xlsx onto the app; the same review +
  error report applies. No extra software is bundled — the app reads and writes
  xlsx itself.
- **Share one board.** ⋯ → *Share / export a board* exports a single board
  (its roles, the people on those slates, nothing else) as a planner CSV — the
  other person opens it in their own copy and sees only that board — or as an
  Excel workbook. When they send it back, *Import & merge* calculates what's
  new or changed against your database and shows it in the review before
  anything is applied. Deletions don't sync — remove records in the master.
- **Starting fresh?** ⋯ → *Download starter template* gives you a small example
  CSV with one row of each type to copy from.
- **Data Tools (developer)** — ⋯ → *Data Tools* holds the power features:
  - **File converters**: upload an Excel workbook and download it as a planner
    CSV (with the usual review + error report), or upload a planner CSV and
    download an Excel workbook — without importing anything into what you have
    open. Handy for prepping files before uploading them.
  - **Field types**: give fields a type — Text, Number, or True/False — like
    cell formats in Excel. Types drive the right input in the forms (true/false
    dropdowns, numeric inputs), block bad values on save and in "+ Add value",
    warn on import, and unlock **greater/less-than** rule operators on Number
    fields. Numeric fields accept **ranges with a dash** (e.g. `2-5`) — the one
    exception to "no letters". **Built-in fields can be re-typed too**: clean
    Readiness up to numbers/ranges and you can make it a Number. A type is
    locked while the existing data doesn't fit it, and numeric-looking fields
    like postal codes can deliberately stay Text. "+ Add field" on any person
    or role also asks for the type right there.
  - **Bulk add fields**: paste one field per line (`Name, type, applies to`)
    to set up many columns at once.

## Appearance (the 🎨 button)

A little fun, zero risk: pick a **color theme** (Classic Blue, Forest, Royal
Plum, Sunset, Ocean), one of **eleven chess piece sets** (Classic, Royal Court,
Animal Kingdom, Woodland, Holiday 🎅, Galaxy 🪐, Robot Lab 🤖, Fantasy Quest 🧙,
Dinosaurs 🦖, Deep Sea 🔱, Champions 🏆), and a **board style** (Classic, Wood,
Card Table, Marble). Choices apply instantly, are saved on your computer only,
and never change the data or anyone else's view. The 🎨 button is also in the
chess-board header, so you can preview sets live on the board.

## Safety

**Undo** (or `Ctrl+Z`) steps back through the last 40 changes. ⋯ → *Reset org
changes* returns roles and slates to the state of the last CSV import while
keeping new people, roles and rules. Deletes always ask first.

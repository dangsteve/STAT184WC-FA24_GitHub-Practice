# Succession Planner — TA Team Guide

One HTML file, one CSV. No install, no server, no accounts.

## Getting started

1. Put `succession_planner.html` and your CSV anywhere — a shared drive works
   fine. Two datasets are included: **`succession_demo.csv`** (small — ideal for
   demos and learning; see `DEMO_SCRIPT.md` for a 5-minute walkthrough) and
   **`succession_data.csv`** (full-size test data).
2. Open `succession_planner.html` in Chrome or Edge.
3. Click **Open CSV / Excel** and pick the database file — a planner CSV or a
   whole Excel workbook (People / Roles / Candidates / Boards tabs; anything
   broken lands in the error report). You can also just drag the file onto the
   window.
4. Work the boards. Click **Save** (or `Ctrl+S`) to write changes straight back
   to the same CSV file (the database always stays CSV — a workbook you opened
   saves as a new .csv). **Export** downloads a copy and asks which format you
   want: planner CSV or an Excel workbook.

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
  the corner. The tree is built from each role's **Reports To** field (on the
  role form): pick the role it reports to from the dropdown and the line is
  drawn — it never moves the role between board tabs. Roles with no Reports To
  are placed by level within their department (dashed lines) until you set one.
- **All Roles / your boards** — the working boards, grouped by level. Drag
  candidates from the Candidate Box onto roles; drag slate rows to re-prioritize.
  Tabs are yours to manage (the **+** tab or ⋯ → *Manage tabs*). A role's
  **Board / Tab(s)** field is a multiselect — tick every tab it should appear
  on, and it shows up on all of them. On any of your tabs, **+ Add Existing
  Roles** opens a searchable pick-list to pull many existing roles onto that
  tab at once (they keep their other tabs; Undo takes them off again).
  **Filters are chips now**: click a chip (Level, Department, Risk, Readiness)
  and tick as many values as you like — two departments show both. *All
  (clear)* resets a chip, **✕** removes it entirely, and **+ Filter** adds any
  other role field — Criticality, Status, Owner, or one of your own custom
  fields. A custom field shows up in that list only once at least one role
  actually has a value in it (add a Compa-Ratio value to one role and it
  becomes filterable; while it's empty everywhere it stays out of the way).
  The chips drive the boards, Insights and the Candidates tab together.
- **Candidates** — every person, stored once by Person ID. Edits update every
  slate that references them. The **Candidate Box** on the right has the same
  filter chips — Department out of the box (pick several at once), and
  **+ Filter** adds readiness, candidate type, location or any custom person
  field that has at least one value. The **✕** at the end of a row deletes that person
  everywhere (after asking) — their slate rows go too, and Undo brings it all
  back. The **Columns ▾** picker chooses what the table shows — Name always
  stays, plus up to four more fields of your choice (built-ins or any custom
  field that has at least one value), remembered on your computer. Tick
  **Show roles & tabs** (off by default) for three extra columns: **Current
  Role** (the seat they hold), **Candidate For** (every slate they're on) and
  **Tabs** (the boards those roles live on). Neither setting ever changes the
  data.
- **Insights** — bench coverage, Ready-Now coverage, vacancies, and the roles
  that need attention (the filter bar applies to these), plus **My Dashboard**:
  up to 8 widgets of your own — a count or % with an optional filter ("roles
  where risk equals High"), a sum or average of a Number field, or a **bar,
  pie or donut** breakdown by any field — **hover a slice or a bar** to see
  the exact count and share. **+ Add widget** builds one in a few clicks,
  ✕ removes it, and widgets are saved in the CSV so the whole team sees them.
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
- **Block a person's move** — **one person or several at once** (checkbox
  picker with a filter box) cannot move into the **target roles you tick**
  (one or many), or cannot change role at all. Need different pairings —
  these people barred from this role, those people from that one? Press
  **+ Add Another Block** and keep every pairing inside the same rule.
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
  error report applies. **Import accepts exactly the layout Export writes** —
  and if you're building a file from scratch, ⋯ → *Download sample Excel
  workbook* gives you a small example with those exact tabs and headers
  (example rows included, ready to replace with your own). The same button
  lives inside Data Tools next to Import & merge, beside the sample CSV
  sheets. No extra software is bundled — the app reads and writes xlsx
  itself.
- **Share one board — or several.** ⋯ → *Share / export a board* exports
  **Everything** by default; flip the switch off and tick exactly the board
  tabs you want to hand over (their roles, the people on those slates, nothing
  else) as a planner CSV — the other person opens it in their own copy and
  sees only those boards — or as an Excel workbook. When they send it back, *Import & merge* calculates what's
  new or changed against your database and shows it in the review before
  anything is applied. Deletions don't sync — remove records in the master.
- **Give them the program too.** In the same Share drawer, tick *Also download
  a copy of the planner itself* — an HTML file downloads right behind the data
  file, and the other person just opens it in Chrome or Edge (nothing to
  install). By default it is the **full program**; uncheck any of the six
  features they shouldn't have — Rules (viewing & editing), Adding roles,
  Adding candidates, Deleting, Approvals & seat moves, Import & Data Tools —
  and those are switched off inside their copy, with a plain-words message if
  they try. Your eligibility and block rules **still run** in their copy either
  way, and a restricted copy can share data files onward but can never hand out
  the program or unlock itself. (It's a guard rail for honest colleagues, not a
  vault — keep the master file with you.)
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
  - **Add a field**: a one-at-a-time form — name, type, who it applies to,
    press *+ Add Field* and it's live immediately. **Bulk add** sits below it
    for setting up many columns at once (one per line: `Name, type, applies
    to`), and the built-in field table now lives at the bottom. The **✕** on
    a custom field deletes it for everyone — every stored value is removed and
    the CSV column disappears on the next save (it asks first, and Undo brings
    it all back). If a rule or dashboard widget uses the field, deletion is
    refused with the rule or widget named, so nothing quietly breaks.

## Appearance (the 🎨 button)

A little fun, zero risk: pick a **color theme** — **Clean White** (the
default: white header, black SP mark) or Classic Blue, Forest, Royal Plum,
Sunset, Ocean, which paint the whole top bar in the theme color — one of
**eleven chess piece sets** (Classic, Royal Court,
Animal Kingdom, Woodland, Holiday 🎅, Galaxy 🪐, Robot Lab 🤖, Fantasy Quest 🧙,
Dinosaurs 🦖, Deep Sea 🔱, Champions 🏆), and a **board style** (Classic, Wood,
Card Table, Marble). Choices apply instantly, are saved on your computer only,
and never change the data or anyone else's view. The 🎨 button is also in the
chess-board header, so you can preview sets live on the board.

## Safety

Every drawer opened from inside another one has a **← Back** button — open a
person, jump to one of their roles, press Back and you're on that person again
(same for Data Tools → Share and every other chain). Closing the drawer ends
the chain.

**Undo** (or `Ctrl+Z`) steps back through the last 40 changes. ⋯ → *Reset org
changes* returns roles and slates to the state of the last CSV import while
keeping new people, roles and rules. Deletes always ask first.

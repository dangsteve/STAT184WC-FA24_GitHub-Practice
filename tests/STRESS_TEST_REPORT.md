# Succession Planner — Stress Test Report

**Result: 100 / 100 automated scenarios pass, zero console errors.**

The suite (`tests/stress_test.cjs`) drives the real app in headless Chromium via
Playwright — it clicks the actual buttons, opens the actual drawers, and fires real
drag-and-drop events. After every mutation it re-serializes the database
(`toCSV()`) and asserts the change is present in the CSV, then re-loads that CSV
to prove nothing is lost. Run it with:

```bash
NODE_PATH=$(npm root -g) node tests/stress_test.cjs
```

## What was tested

| # | Area | Scenarios |
|---|------|-----------|
| 1 | Boot & load | blank boot, 533-row dummy CSV load (150 people / 72 roles / 294 slate rows / 5 rules / 10 boards), byte-stable round-trip: `toCSV(loadCSV(toCSV()))` is identical |
| 2 | Boards & filters | custom-board scoping, search, level / department / risk / readiness filters (each checked against independently computed counts) |
| 3 | People CRUD | add via drawer with hostile input (quotes, commas, newlines, `<script>` tag), XSS check, exact round-trip of hostile fields, edit propagation to slates & incumbency, **person-ID rename migrates every reference**, duplicate-ID rejection, required-field validation, delete with confirm |
| 4 | Role CRUD | add with quotes in title, **role-ID rename migrates slates / children / rules**, circular-manager rejection, delete cleans slates and repoints children |
| 5 | Drag & drop | candidate → role (rank appended), duplicate rejection, pill → pill reorder (insert-before, ranks renumbered 1..n), pill → other role (approval reset), rank arrows incl. boundary no-ops, remove pill, select → quick-assign flow, dropping a .csv file onto the window |
| 6 | Rules engine | RULE-001 blocks non-Ready-Now approval; clean approve moves incumbent, vacates old role, strips other slate rows, logs history — all verified in the CSV; Approve-Top-on-empty warns; auto-move queue on occupied role; vacancy triggers queue; BLOCK rule created through the drawer blocks the move; "cannot change role" variant; **eligibility semantics: candidates meeting every requirement pass, anyone failing is stopped — verified across equals / not equals / contains / not contains / list / multi-requirement AND**; contains rule built through the UI (pass allowed, fail flagged); enable/disable switch changes behavior and persists; AUTO_BACKFILL by candidate type and by custom role→person mapping (both built through the drawer UI) |
| 7 | Undo / reset / clear | 3-deep undo restores byte-identical state, empty-stack warning, Ctrl+Z, reset-org-changes returns roles+slates to the import baseline while keeping new people/rules, clear-all + undo, history persists through round-trip |
| 8 | Tabs & custom values | add/rename/remove tabs via drawer (BOARD rows in CSV), role→board assignment, active-tab fallback, "+ Add value…" custom dropdown values persist in the SETTING row and appear in filters, inline manager-role creation from the role form |
| 9 | Hostile data | duplicate people/slate rows consolidated (fields merged, best readiness kept, types joined, approved kept), dangling successor references flagged as ERR without crashing, empty/garbage/header-only CSV rejected with state untouched, approving a successor whose person record is missing |
| 10 | Insights | KPI numbers cross-checked against independently computed coverage/vacancy values; respects the filter bar |
| 11 | Safety nets | dirty-flag lifecycle, localStorage auto-backup written and **auto-restored on reload with no clicks** (unsaved work stays flagged and the banner explains it), Escape/backdrop drawer close |
| 12 | Scale | 3,000 people / 800 roles / 4,000 slate rows: load 281 ms, full board render 266 ms, serialize 849 ms, round-trip intact; capped tables stay responsive |
| 13 | Chess view | opens from a role card with the incumbent as King and pieces ranked Queen→Pawn; piece-onto-piece drag swaps places (staged only — real rankings untouched); Save persists the order to state and CSV; staging a rule-blocked candidate shows the callout and Save refuses; taking the seat shows vacancy + steps-down callouts and on Save moves the incumbent, vacates the old role and persists; Close with staged moves asks to discard and changes nothing; the field picker updates every piece at once and "Make default for all boards" survives the CSV round-trip; the **piece bank** lists only off-slate people with live search, a bank piece dropped on the open board stages a New pawn (no real row until Save, then correct rank + CSV row), dropped on a square it takes that exact spot shifting others down, dropped on the throne it takes the seat on save, staged pieces can be removed, and discarding leaves the CSV byte-identical |
| 14 | CSV simplicity | unknown CSV columns are preserved per record, re-exported, and byte-stable; "+ Add field" in the person drawer creates a new CSV column visible on every person; a ROLE row naming an unknown board auto-creates the tab (readable name, BOARD row written back); the org tree infers SVP→VP→Director family-tree lines by level+department, renders them dashed, and "Apply inferred lines" writes real managerRoleIds (undoable); starter template download |
| 15 | File memory & sheet imports | the opened file's handle is remembered across sessions (IndexedDB verified on file://), the reconnect banner reopens it and Save overwrites it (full write-back verified via OPFS), an unusable stored handle fails gracefully with guidance and Forget clears it; **sheet merge imports**: a People sheet with human headers ("Name", "Shirt Size") merges with auto-generated IDs, unknown columns kept as extra fields, blank cells never wiping data, and nothing applied until Apply Import; a slate sheet resolves role titles and person names with dangling references skipped as ERRORs that appear in the downloadable error report; a roles sheet resolves manager-by-title and incumbent-by-name and auto-creates board tabs; Cancel leaves the database byte-identical; sheets dropped together are processed people→roles→slate regardless of drop order |
| 16 | Excel & share/merge-back | chess-board footer switcher (dropdown + prev/next) jumps between roles with a discard-confirm on staged moves; the self-contained xlsx engine exports a People/Roles/Candidates/Boards workbook that **round-trips the entire database with zero diffs**; the reader handles real-world Excel files (DEFLATE compression + sharedStrings, verified against a Node-built fixture); scoped share exports one board (its roles + referenced people + slates only) that a recipient opens as a one-board planner; the returned file merges back through the review — edited fields updated, unique new people added (exactly one), untouched master data intact — and rule changes in returned full exports merge as "Other updates" |
| 17 | Data tools, typed fields & org canvas | the org chart is a full-height pan/zoom canvas — opens fitted and centered on the top role at a readable zoom, wheel zooms toward the cursor, hold-and-drag pans (with the click correctly suppressed after a drag — a real pointer-capture bug the test caught), plain clicks still open the role, and +/−/Fit controls work; Data Tools bulk-adds typed custom fields (text/number/boolean with an applies-to scope) persisted as a fieldTypes SETTING row; typed fields render as number inputs / true-false selects in the drawers; **greater/less-than eligibility operators work on numeric custom fields** and custom fields appear in the rule builder; type changes are locked when existing data does not fit (letters block Number/Boolean; numeric-looking data like postal codes may stay Text); the Excel→CSV converter produces a reviewed planner CSV without touching the open database, and CSV→Excel converts directly |

## Bugs found by the tests and fixed

1. **Drawer Save button died after using "+ Add"** — the add-chooser hid the Save
   button and nothing restored it, so every later drawer save was unclickable.
2. **Insights bars were invisible** — inline `<span>` fills ignore width/height;
   made them block-level.
3. **Quadratic render** — `levels()` was recomputed inside a per-role filter;
   an 800-role render took 22.4 s. After hoisting + indexing person lookups it
   takes 266 ms (~84× faster).

## Latent bugs from v26 fixed during the rebuild

- **Boot crash**: the original file throws `activeTab is not defined` on startup
  (verified in-browser: zero tabs render until a CSV load happens to create the
  global). The rebuild declares and initializes it.
- **ID renames left dangling references**: renaming a person/role ID orphaned
  slate rows, incumbencies, manager links and rule targets. Now all references
  migrate, and colliding IDs are rejected instead of silently overwriting.
- **Quote-injection in click handlers**: IDs/names containing `'` broke inline
  `onclick="...'${id}'..."` handlers. All events now use `data-*` attributes with
  delegated listeners; no user data is ever interpolated into JavaScript.
- **RULE-005 never fired**: a BLOCK rule with no operator and no target role did
  nothing. Loading now infers `cannot change role` (the only meaning such a rule
  can have — and what its own name says).
- **Custom risk/criticality values were saved under the wrong key**
  (`rRisk` instead of `risk`), so they vanished from dropdowns on reload.
- **Cancelling the file picker opened a second file dialog** (fall-through).
- **Circular reporting lines** could be saved and could hang tree rendering;
  now rejected on save, and the tree renderer is cycle-proof regardless.
- **Automation loops**: a custom backfill mapping could ping-pong two people
  between roles forever; cascades now stop after 25 steps with an error message.

## Screenshots

Captured by the suite from the running app: `screen_board.png`,
`screen_insights.png`, `screen_tree.png`, `screen_rules.png`, `screen_drawer.png`.

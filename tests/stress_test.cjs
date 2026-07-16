/* =============================================================================
   Succession Planner — heavy stress test
   Drives the real app in headless Chromium (Playwright) and verifies that
   every UI scenario works AND that every change persists into the CSV.
   Run:  NODE_PATH=$(npm root -g) node tests/stress_test.cjs
   ============================================================================= */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'file://' + path.join(ROOT, 'succession_planner.html');
const BASE_CSV = fs.readFileSync(path.join(ROOT, 'succession_data.csv'), 'utf8');

const results = []; // {name, ok, err}
let consoleErrors = [];
let dialogs = [];

function section(name) { console.log('\n== ' + name + ' =='); }
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  PASS  ' + name); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log('  FAIL  ' + name + '\n        ' + String(e.message).split('\n')[0]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || 'not equal') + ` — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }

/* ---------- page helpers ---------- */
async function newPage(browser) {
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('dialog', async d => { dialogs.push({ type: d.type(), message: d.message() }); await d.accept(); });
  await page.goto(APP_URL);
  return page;
}
async function loadBase(page, csv = BASE_CSV) {
  const ok = await page.evaluate(t => window.__APP__.loadCSV(t), csv);
  assert(ok === true, 'loadCSV returned ' + ok);
}
const counts = p => p.evaluate(() => ({
  roles: __APP__.roles.length, people: __APP__.people.length, succ: __APP__.successors.length,
  rules: __APP__.rules.length, hist: __APP__.history.length,
  boards: __APP__.boards.length, dirty: __APP__.dirty, undo: __APP__.undoDepth,
}));
const csvOf = p => p.evaluate(() => window.__APP__.toCSV());
const lastMsg = p => p.evaluate(() => __APP__.messages[0] || null);
async function clickAction(page, action, extra = '') {
  await page.click(`[data-action="${action}"]${extra}`);
}
async function setSelect(page, id, value) {
  await page.evaluate(([id, value]) => {
    const el = document.getElementById(id); el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);
}
async function typeInto(page, id, value) {
  await page.evaluate(([id, value]) => {
    const el = document.getElementById(id); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [id, value]);
}
async function simulateDrag(page, srcSel, dstSel) {
  return page.evaluate(([srcSel, dstSel]) => {
    const src = document.querySelector(srcSel), dst = document.querySelector(dstSel);
    if (!src || !dst) return 'missing element: ' + (!src ? srcSel : dstSel);
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return 'ok';
  }, [srcSel, dstSel]);
}
/* CSV text -> array of row-objects, for checking persistence */
function parseCsvRows(text) {
  const rows = []; let row = [], val = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && q && n === '"') { val += '"'; i++; }
    else if (c === '"') q = !q;
    else if (c === ',' && !q) { row.push(val); val = ''; }
    else if ((c === '\n' || c === '\r') && !q) { if (val || row.length) { row.push(val); rows.push(row); row = []; val = ''; } if (c === '\r' && n === '\n') i++; }
    else val += c;
  }
  if (val || row.length) rows.push([...row, val]);
  const headers = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();

  /* ===================================================================
     1. BOOT & LOAD
     =================================================================== */
  section('1. Boot & CSV load');
  let page = await newPage(browser);

  await test('boots blank with tabs, empty state, no errors', async () => {
    assertEq(await page.locator('.tab').count(), 7, 'tab count'); // 6 system + "+"
    assert(await page.locator('.empty').count() >= 1, 'empty state shown');
    assertEq((await counts(page)).roles, 0);
  });
  await test('loads the dummy CSV database', async () => {
    await loadBase(page);
    const c = await counts(page);
    assertEq(c.people, 150, 'people'); assertEq(c.roles, 72, 'roles');
    assertEq(c.rules, 5, 'rules'); assert(c.succ >= 280, 'successors merged/loaded: ' + c.succ);
    assertEq(c.boards, 6 + 10, 'boards = 6 system + 10 custom');
    assert(!c.dirty, 'clean after load');
  });
  await test('org tree renders with nodes', async () => {
    assert(await page.locator('.node').count() >= 70, 'tree nodes');
  });
  await test('CSV round-trip is byte-stable and state-stable', async () => {
    const csv1 = await csvOf(page);
    await loadBase(page, csv1);
    const csv2 = await csvOf(page);
    assert(csv1 === csv2, 'toCSV(loadCSV(toCSV())) differs from toCSV()');
    const c = await counts(page);
    assertEq(c.people, 150); assertEq(c.roles, 72); assertEq(c.rules, 5);
  });
  await test('every original SUCCESSOR/PERSON/ROLE/RULE/BOARD row survives round-trip', async () => {
    const rows = parseCsvRows(await csvOf(page));
    const by = t => rows.filter(r => r.recordType === t).length;
    assertEq(by('PERSON'), 150); assertEq(by('ROLE'), 72); assertEq(by('RULE'), 5);
    assertEq(by('BOARD'), 10); assertEq(by('SETTING'), 2); // customFieldValues + chessFields
    assert(by('SUCCESSOR') >= 280, 'successor rows');
  });

  /* ===================================================================
     2. BOARDS, FILTERS, SEARCH
     =================================================================== */
  section('2. Boards, filters, search');
  await test('switching to a custom board shows only its roles', async () => {
    await page.click('[data-action="tab"][data-tab-id="ALL"]');
    const all = await page.locator('.role').count();
    assertEq(all, 72, 'ALL shows every role');
    await page.click('[data-action="tab"][data-tab-id="BOARD-PROD"]');
    const expected = await page.evaluate(() => {
      const b = __APP__.boards.find(x => x.id === 'BOARD-PROD');
      return __APP__.roles.filter(r => r.boardId === 'BOARD-PROD' || b.name === r.department).length;
    });
    assertEq(await page.locator('.role').count(), expected, 'board-filtered roles');
  });
  await test('search filters role cards', async () => {
    await page.click('[data-action="tab"][data-tab-id="ALL"]');
    await typeInto(page, 'search', 'Chief');
    await page.waitForTimeout(250);
    const shown = await page.locator('.role').count();
    const expected = await page.evaluate(() => {
      const q = 'chief';
      return __APP__.roles.filter(r => {
        const ss = __APP__.successors.filter(s => s.roleId === r.id);
        const nm = id => (__APP__.people.find(p => p.id === id) || {}).name || '';
        const txt = [r.id, r.title, r.level, r.department, r.incumbentName, nm(r.incumbentPersonId), ss.map(s => nm(s.personId)).join(' ')].join(' ').toLowerCase();
        return txt.includes(q);
      }).length;
    });
    assertEq(shown, expected, 'search results');
    await typeInto(page, 'search', ''); await page.waitForTimeout(250);
  });
  await test('department / risk / readiness / level filters work', async () => {
    await setSelect(page, 'deptFilter', 'Finance');
    let shown = await page.locator('.role').count();
    let expected = await page.evaluate(() => __APP__.roles.filter(r => r.department === 'Finance').length);
    assertEq(shown, expected, 'dept filter');
    await setSelect(page, 'deptFilter', 'All Departments');
    await setSelect(page, 'riskFilter', 'High');
    shown = await page.locator('.role').count();
    expected = await page.evaluate(() => __APP__.roles.filter(r => r.risk === 'High').length);
    assertEq(shown, expected, 'risk filter');
    await setSelect(page, 'riskFilter', 'All Risks');
    await setSelect(page, 'readinessFilter', 'No Candidate');
    shown = await page.locator('.role').count();
    expected = await page.evaluate(() => __APP__.roles.filter(r => !__APP__.successors.some(s => s.roleId === r.id)).length);
    assertEq(shown, expected, 'readiness=No Candidate filter');
    await setSelect(page, 'readinessFilter', 'All Readiness');
    await setSelect(page, 'levelFilter', 'C-Suite');
    shown = await page.locator('.role').count();
    expected = await page.evaluate(() => __APP__.roles.filter(r => r.level === 'C-Suite').length);
    assertEq(shown, expected, 'level filter');
    await setSelect(page, 'levelFilter', 'All Levels');
  });

  /* ===================================================================
     3. PEOPLE CRUD (via real drawer UI) + persistence
     =================================================================== */
  section('3. People CRUD via drawer UI');
  const evilName = `O'Hara "Zoe", <script>window.__XSS__=1<\/script>`;
  await test('add person with hostile characters via + Add drawer', async () => {
    await clickAction(page, 'addChooser');
    await page.click('#drawerBody [data-action="openPersonDrawerNew"]');
    await typeInto(page, 'pId', 'P-EVIL');
    await typeInto(page, 'pName', evilName);
    await typeInto(page, 'pNotes', 'line1\nline2, with "quotes" and ,commas,');
    await setSelect(page, 'pReady', 'Ready Now');
    await page.click('#drawerSave');
    const p = await page.evaluate(() => __APP__.people.find(x => x.id === 'P-EVIL'));
    assert(p, 'person saved');
    assertEq(p.name, evilName, 'name preserved exactly');
    const xss = await page.evaluate(() => window.__XSS__);
    assert(!xss, 'no XSS executed');
  });
  await test('hostile person survives CSV round-trip exactly', async () => {
    const csv = await csvOf(page);
    await loadBase(page, csv);
    const p = await page.evaluate(() => __APP__.people.find(x => x.id === 'P-EVIL'));
    assertEq(p.name, evilName, 'name after round-trip');
    assertEq(p.notes, 'line1\nline2, with "quotes" and ,commas,', 'notes after round-trip');
  });
  await test('edit person propagates name to slates & incumbency, persists to CSV', async () => {
    await page.evaluate(() => { __APP__.activeTab = 'PEOPLE'; __APP__.render(); });
    await page.click('tr[data-action="openPerson"][data-person-id="P001"]');
    await typeInto(page, 'pName', 'Mei Smith-Chan');
    await page.click('#drawerSave');
    const role = await page.evaluate(() => __APP__.roles.find(r => r.incumbentPersonId === 'P001'));
    assertEq(role.incumbentName, 'Mei Smith-Chan', 'incumbentName updated');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'PERSON' && r.personId === 'P001' && r.personName === 'Mei Smith-Chan'), 'CSV has new name');
  });
  await test('renaming a person ID updates every reference', async () => {
    const before = await page.evaluate(() => ({
      slates: __APP__.successors.filter(s => s.personId === 'P052').length,
      inc: __APP__.roles.filter(r => r.incumbentPersonId === 'P052').length,
    }));
    assert(before.slates > 0, 'P052 has slate rows to migrate');
    await page.evaluate(() => { __APP__.openPersonDrawer('P052'); });
    await typeInto(page, 'pId', 'P052-NEW');
    await page.click('#drawerSave');
    const after = await page.evaluate(() => ({
      old: __APP__.successors.filter(s => s.personId === 'P052').length,
      nw: __APP__.successors.filter(s => s.personId === 'P052-NEW').length,
      incOld: __APP__.roles.filter(r => r.incumbentPersonId === 'P052').length,
      incNew: __APP__.roles.filter(r => r.incumbentPersonId === 'P052-NEW').length,
    }));
    assertEq(after.old, 0, 'no stale successor refs');
    assertEq(after.nw, before.slates, 'successor refs migrated');
    assertEq(after.incOld, 0, 'no stale incumbency');
    assertEq(after.incNew, before.inc, 'incumbency migrated');
    const rows = parseCsvRows(await csvOf(page));
    assert(!rows.some(r => r.recordType === 'SUCCESSOR' && r.personId === 'P052'), 'CSV has no stale refs');
  });
  await test('duplicate person ID is rejected', async () => {
    const n = (await counts(page)).people;
    await page.evaluate(() => __APP__.openPersonDrawer());
    await typeInto(page, 'pId', 'P001');
    await typeInto(page, 'pName', 'Impostor');
    await page.click('#drawerSave');
    assertEq((await counts(page)).people, n, 'no new person added');
    assertEq((await lastMsg(page)).type, 'ERR', 'error message shown');
    await clickAction(page, 'closeDrawer');
  });
  await test('missing required fields are rejected', async () => {
    await page.evaluate(() => __APP__.openPersonDrawer());
    await typeInto(page, 'pId', ''); await typeInto(page, 'pName', '');
    await page.click('#drawerSave');
    assertEq((await lastMsg(page)).type, 'ERR');
    await clickAction(page, 'closeDrawer');
  });
  await test('delete person clears slates and incumbency (confirm dialog)', async () => {
    dialogs = [];
    await page.evaluate(() => __APP__.openPersonDrawer('P052-NEW'));
    await page.click('[data-action="deletePerson"]');
    assert(dialogs.length === 1 && dialogs[0].type === 'confirm', 'confirm asked');
    const after = await page.evaluate(() => ({
      person: !!__APP__.people.find(p => p.id === 'P052-NEW'),
      slates: __APP__.successors.filter(s => s.personId === 'P052-NEW').length,
      inc: __APP__.roles.filter(r => r.incumbentPersonId === 'P052-NEW').length,
    }));
    assert(!after.person && !after.slates && !after.inc, 'fully removed');
    const rows = parseCsvRows(await csvOf(page));
    assert(!rows.some(r => r.personId === 'P052-NEW'), 'gone from CSV');
  });

  /* ===================================================================
     4. ROLE CRUD via drawer UI
     =================================================================== */
  section('4. Role CRUD via drawer UI');
  await loadBase(page); // fresh baseline
  await test('add role via drawer with quotes in title, persists to CSV', async () => {
    await page.evaluate(() => __APP__.openRoleDrawer());
    await typeInto(page, 'rId', 'R-TEST-1');
    await typeInto(page, 'rTitle', `Head of "Special" Ops, EMEA`);
    await setSelect(page, 'rLevel', 'VP');
    await setSelect(page, 'rManager', 'R-CEO');
    await page.click('#drawerSave');
    const r = await page.evaluate(() => __APP__.roles.find(x => x.id === 'R-TEST-1'));
    assertEq(r.title, 'Head of "Special" Ops, EMEA');
    assertEq(r.managerRoleId, 'R-CEO');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(x => x.recordType === 'ROLE' && x.roleId === 'R-TEST-1' && x.roleTitle === 'Head of "Special" Ops, EMEA'), 'in CSV');
  });
  await test('renaming a role ID migrates slates, children and rules', async () => {
    const before = await page.evaluate(() => __APP__.successors.filter(s => s.roleId === 'R-CFO').length);
    assert(before > 0, 'R-CFO has slate');
    await page.evaluate(() => __APP__.openRoleDrawer('R-CFO'));
    await typeInto(page, 'rId', 'R-CFO-X');
    await page.click('#drawerSave');
    const after = await page.evaluate(() => ({
      old: __APP__.successors.filter(s => s.roleId === 'R-CFO').length,
      nw: __APP__.successors.filter(s => s.roleId === 'R-CFO-X').length,
      kids: __APP__.roles.filter(r => r.managerRoleId === 'R-CFO').length,
    }));
    assertEq(after.old, 0); assertEq(after.nw, before); assertEq(after.kids, 0, 'children repointed');
  });
  await test('circular manager assignment is blocked', async () => {
    const child = await page.evaluate(() => __APP__.roles.find(r => r.managerRoleId === 'R-CEO').id);
    await page.evaluate(() => __APP__.openRoleDrawer('R-CEO'));
    await setSelect(page, 'rManager', child);
    await page.click('#drawerSave');
    assertEq((await lastMsg(page)).type, 'ERR', 'circular blocked');
    await clickAction(page, 'closeDrawer');
    const mgr = await page.evaluate(() => __APP__.roles.find(r => r.id === 'R-CEO').managerRoleId);
    assert(!mgr, 'R-CEO still root');
  });
  await test('delete role removes slate entries and repoints children', async () => {
    dialogs = [];
    await page.evaluate(() => __APP__.openRoleDrawer('R-TEST-1'));
    await page.click('[data-action="deleteRole"]');
    assert(dialogs.length === 1, 'confirmed');
    const gone = await page.evaluate(() => !__APP__.roles.some(r => r.id === 'R-TEST-1') && !__APP__.successors.some(s => s.roleId === 'R-TEST-1'));
    assert(gone, 'role gone everywhere');
  });

  /* ===================================================================
     5. DRAG & DROP + slate mechanics
     =================================================================== */
  section('5. Drag & drop, ranking, slate mechanics');
  await loadBase(page);
  await page.click('[data-action="tab"][data-tab-id="ALL"]');

  await test('drag a candidate from the box onto a role adds a slate row', async () => {
    // find a person NOT on R-CEO slate
    const pid = await page.evaluate(() => {
      const onSlate = new Set(__APP__.successors.filter(s => s.roleId === 'R-CEO').map(s => s.personId));
      return __APP__.people.find(p => !onSlate.has(p.id) && p.id !== (__APP__.roles.find(r => r.id === 'R-CEO') || {}).incumbentPersonId).id;
    });
    await typeInto(page, 'pieceSearch', pid); await page.waitForTimeout(200);
    const before = await page.evaluate(() => __APP__.successors.filter(s => s.roleId === 'R-CEO').length);
    const res = await simulateDrag(page, `.piece[data-person-id="${pid}"]`, `.role[data-role-id="R-CEO"]`);
    assertEq(res, 'ok');
    const s = await page.evaluate(pid => __APP__.successors.find(s => s.roleId === 'R-CEO' && s.personId === pid), pid);
    assert(s, 'slate row created');
    assertEq(s.ranking, before + 1, 'appended at bottom rank');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'SUCCESSOR' && r.successorRoleId === 'R-CEO' && r.personId === pid), 'persisted to CSV');
    await typeInto(page, 'pieceSearch', ''); await page.waitForTimeout(200);
  });
  await test('duplicate drop is rejected with a warning', async () => {
    const { pid, n } = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.roleId === 'R-CEO');
      return { pid: s.personId, n: __APP__.successors.filter(x => x.roleId === 'R-CEO').length };
    });
    await typeInto(page, 'pieceSearch', pid); await page.waitForTimeout(200);
    await simulateDrag(page, `.piece[data-person-id="${pid}"]`, `.role[data-role-id="R-CEO"]`);
    const n2 = await page.evaluate(() => __APP__.successors.filter(x => x.roleId === 'R-CEO').length);
    assertEq(n2, n, 'no duplicate');
    assertEq((await lastMsg(page)).type, 'WARN');
    await typeInto(page, 'pieceSearch', ''); await page.waitForTimeout(200);
  });
  await test('drag a pill onto another pill reorders (insert before)', async () => {
    const ids = await page.evaluate(() => __APP__.slateFor('R-CEO').map(s => s.id));
    assert(ids.length >= 3, 'needs 3+ candidates');
    const last = ids[ids.length - 1], first = ids[0];
    await simulateDrag(page, `.succ[data-succ-id="${last}"]`, `.succ[data-succ-id="${first}"]`);
    const ids2 = await page.evaluate(() => __APP__.slateFor('R-CEO').map(s => s.id));
    assertEq(ids2[0], last, 'moved to front');
    const ranks = await page.evaluate(() => __APP__.slateFor('R-CEO').map(s => s.ranking).join(','));
    assertEq(ranks, ids2.map((_, i) => i + 1).join(','), 'ranks normalized 1..n');
  });
  await test('drag a pill onto another role moves the candidate across slates', async () => {
    const { sid, pid } = await page.evaluate(() => {
      const s = __APP__.slateFor('R-CEO').find(x => !__APP__.successors.some(y => y.personId === x.personId && y.roleId === 'R-COO'));
      return { sid: s.id, pid: s.personId };
    });
    await simulateDrag(page, `.succ[data-succ-id="${sid}"]`, `.role[data-role-id="R-COO"]`);
    const s = await page.evaluate(sid => __APP__.successors.find(x => x.id === sid), sid);
    assertEq(s.roleId, 'R-COO', 'moved to R-COO');
    assertEq(s.approved, false, 'approval reset on move');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'SUCCESSOR' && r.roleId === sid && r.successorRoleId === 'R-COO'), 'CSV updated');
  });
  await test('rank arrows move candidates up/down and are boundary-safe', async () => {
    const slate = await page.evaluate(() => __APP__.slateFor('R-CEO').map(s => s.id));
    const secondId = slate[1];
    await page.click(`.succ[data-succ-id="${secondId}"] [data-action="rank"][data-delta="-1"]`);
    let after = await page.evaluate(() => __APP__.slateFor('R-CEO').map(s => s.id));
    assertEq(after[0], secondId, 'moved up');
    await page.click(`.succ[data-succ-id="${secondId}"] [data-action="rank"][data-delta="-1"]`);
    after = await page.evaluate(() => __APP__.slateFor('R-CEO').map(s => s.id));
    assertEq(after[0], secondId, 'no-op at top boundary');
  });
  await test('remove pill deletes slate row and renumbers', async () => {
    const { sid, n } = await page.evaluate(() => ({ sid: __APP__.slateFor('R-CEO')[0].id, n: __APP__.slateFor('R-CEO').length }));
    await page.click(`.succ[data-succ-id="${sid}"] [data-action="removeSucc"]`);
    const after = await page.evaluate(() => __APP__.slateFor('R-CEO'));
    assertEq(after.length, n - 1, 'removed');
    assertEq(after.map(s => s.ranking).join(','), after.map((_, i) => i + 1).join(','), 'renumbered');
  });
  await test('select candidate → “+ name” quick-assign button on role cards', async () => {
    const pid = await page.evaluate(() => {
      const onSlate = new Set(__APP__.successors.filter(s => s.roleId === 'R-CMO').map(s => s.personId));
      return __APP__.people.find(p => !onSlate.has(p.id)).id;
    });
    await typeInto(page, 'pieceSearch', pid); await page.waitForTimeout(200);
    await page.click(`.piece[data-person-id="${pid}"] [data-action="selectPiece"]`);
    await page.click(`[data-action="assignSelected"][data-role-id="R-CMO"]`);
    const ok = await page.evaluate(pid => __APP__.successors.some(s => s.roleId === 'R-CMO' && s.personId === pid), pid);
    assert(ok, 'assigned via quick button');
    await page.click('[data-action="clearSelection"]');
    await typeInto(page, 'pieceSearch', ''); await page.waitForTimeout(200);
  });
  await test('drop a .csv file onto the window loads it', async () => {
    const mini = 'recordType,boardId,boardName,roleId,roleTitle,level,department,managerRoleId,incumbentPersonId,incumbentName,risk,criticality,owner,status,sortOrder,personId,personName\nROLE,,,R-MINI,Mini Role,VP,MiniDept,,,,High,High,,Active,1,,\nPERSON,,,,,,,,,,,,,,,P-MINI,Mini Person';
    await page.evaluate(csv => {
      const dt = new DataTransfer();
      dt.items.add(new File([csv], 'mini.csv', { type: 'text/csv' }));
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, mini);
    await page.waitForFunction(() => __APP__.roles.length === 1 && __APP__.people.length === 1);
    const r = await page.evaluate(() => __APP__.roles[0]);
    assertEq(r.id, 'R-MINI');
  });

  /* ===================================================================
     6. APPROVALS, RULES ENGINE, AUTOMATION
     =================================================================== */
  section('6. Approvals, rules engine, automation');
  await loadBase(page);
  await page.click('[data-action="tab"][data-tab-id="ALL"]');

  await test('RULE-001 blocks approving a not-Ready-Now candidate', async () => {
    const target = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.readiness !== 'Ready Now' && __APP__.roles.some(r => r.id === s.roleId) && __APP__.people.some(p => p.id === s.personId));
      return { sid: s.id, roleId: s.roleId, inc: (__APP__.roles.find(r => r.id === s.roleId) || {}).incumbentPersonId };
    });
    await page.evaluate(sid => __APP__.approveSuccessor(sid), target.sid);
    const after = await page.evaluate(t => ({
      approved: __APP__.successors.find(s => s.id === t.sid)?.approved,
      inc: __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId,
    }), target);
    assert(!after.approved, 'not approved');
    assertEq(after.inc, target.inc, 'incumbent unchanged');
    assertEq((await lastMsg(page)).type, 'ERR', 'block message');
  });
  await test('approving a Ready-Now candidate moves them in, vacates old role, persists', async () => {
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.readiness === 'Ready Now' && s.source !== 'External'
        && __APP__.people.some(p => p.id === s.personId)
        && (__APP__.people.find(p => p.id === s.personId).mobility !== 'No')
        && __APP__.roles.some(r => r.id === s.roleId)
        && __APP__.roles.some(r => r.incumbentPersonId === s.personId && r.id !== s.roleId)
        && __APP__.evaluateRules(s).blocks.length === 0);
      const old = __APP__.roles.find(r => r.incumbentPersonId === s.personId);
      return { sid: s.id, pid: s.personId, roleId: s.roleId, oldRoleId: old.id };
    });
    await page.evaluate(sid => __APP__.approveSuccessor(sid), t.sid);
    const after = await page.evaluate(t => ({
      inc: __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId,
      old: __APP__.roles.find(r => r.id === t.oldRoleId),
      others: __APP__.successors.filter(s => s.personId === t.pid && s.id !== t.sid).length,
      s: __APP__.successors.find(s => s.id === t.sid),
    }), t);
    assertEq(after.inc, t.pid, 'new incumbent set');
    // old role either vacated, or automation backfilled it (queued/custom): status changed either way
    assert(['Action Required', 'Auto Move'].includes(after.old.status), 'old role vacated or backfilled: ' + after.old.status);
    assertEq(after.others, 0, 'other slate entries for the person removed');
    assert(after.s.approved === true, 'approved flag');
    const rows = parseCsvRows(await csvOf(page));
    const row = rows.find(r => r.recordType === 'ROLE' && r.roleId === t.roleId);
    assertEq(row.incumbentPersonId, t.pid, 'CSV incumbent updated');
    assert(rows.some(r => r.recordType === 'SUCCESSOR' && r.roleId === t.sid && r.approved === 'true'), 'CSV approved flag');
    assert(rows.some(r => r.recordType === 'HISTORY' && r.historyAction === 'Approved Move'), 'history logged in CSV');
  });
  await test('Approve Top on empty slate warns without crashing', async () => {
    const rid = await page.evaluate(() => {
      let r = __APP__.roles.find(r => !__APP__.successors.some(s => s.roleId === r.id));
      if (!r) { r = { id: 'R-EMPTY-T', title: 'Empty Slate Role', level: 'VP', department: '', boardId: '', managerRoleId: '', incumbentPersonId: '', incumbentName: 'VACANT', risk: 'Low', criticality: 'Low', owner: '', status: '', sortOrder: 999 }; __APP__.roles.push(r); __APP__.render(); }
      return r.id;
    });
    await page.evaluate(rid => __APP__.approveTop(rid), rid);
    assertEq((await lastMsg(page)).type, 'WARN');
  });
  await test('auto move queues on an occupied role (⚡ pill + CSV flag)', async () => {
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => {
        const r = __APP__.roles.find(r => r.id === s.roleId);
        const p = __APP__.people.find(p => p.id === s.personId);
        return r && p && !__APP__.isRoleVacant(r) && s.readiness === 'Ready Now' && p.mobility !== 'No' && s.source !== 'External'
          && __APP__.evaluateRules(s).blocks.length === 0;
      });
      return { sid: s.id };
    });
    await page.evaluate(sid => __APP__.autoMove(sid), t.sid);
    const s = await page.evaluate(sid => __APP__.successors.find(x => x.id === sid), t.sid);
    assert(s.autoMoveQueued === true, 'queued');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'SUCCESSOR' && r.roleId === t.sid && r.autoMoveQueued === 'true'), 'CSV queue flag');
  });
  await test('vacating a role triggers the queued auto move', async () => {
    // isolate the queue path: RULE-004 (AUTO_BACKFILL) legitimately outranks the queue,
    // so disable backfill rules for this test
    await page.evaluate(() => { __APP__.rules.filter(r => r.type === 'AUTO_BACKFILL').forEach(r => r.enabled = false); });
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.autoMoveQueued);
      return { sid: s.id, pid: s.personId, roleId: s.roleId };
    });
    await page.evaluate(rid => {
      const r = __APP__.roles.find(x => x.id === rid);
      r.incumbentPersonId = ''; r.incumbentName = 'VACANT';
      __APP__.runVacancyAutomation(rid); __APP__.render();
    }, t.roleId);
    const after = await page.evaluate(t => ({
      inc: __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId,
      slate: __APP__.successors.filter(s => s.personId === t.pid).length,
    }), t);
    assertEq(after.inc, t.pid, 'queued candidate auto-moved in');
    assertEq(after.slate, 0, 'their slate rows consumed');
  });

  await test('create BLOCK rule via drawer UI; it blocks the move; persists', async () => {
    await loadBase(page);
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.readiness === 'Ready Now' && __APP__.people.find(p => p.id === s.personId)?.mobility !== 'No' && s.source !== 'External' && __APP__.roles.some(r => r.id === s.roleId) && __APP__.evaluateRules(s).blocks.length === 0);
      return { sid: s.id, pid: s.personId, roleId: s.roleId };
    });
    await page.evaluate(() => __APP__.openRuleDrawer());
    await typeInto(page, 'ruleId', 'RULE-BLOCK-T');
    await typeInto(page, 'ruleName', 'Test Block');
    await setSelect(page, 'ruleType', 'BLOCK');
    await setSelect(page, 'rulePerson', t.pid);
    await setSelect(page, 'ruleTarget', t.roleId);
    await page.click('#drawerSave');
    assert(await page.evaluate(() => __APP__.rules.some(r => r.id === 'RULE-BLOCK-T')), 'rule saved');
    await page.evaluate(sid => __APP__.approveSuccessor(sid), t.sid);
    const inc = await page.evaluate(t => __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId, t);
    assert(inc !== t.pid, 'move blocked by rule');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'RULE' && r.ruleId === 'RULE-BLOCK-T' && r.rulePersonId === t.pid), 'rule persisted');
  });
  await test('"cannot change role" BLOCK variant works', async () => {
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.readiness === 'Ready Now'
        && __APP__.roles.some(r => r.incumbentPersonId === s.personId && r.id !== s.roleId)
        && __APP__.people.find(p => p.id === s.personId)?.mobility !== 'No' && s.source !== 'External');
      return { sid: s.id, pid: s.personId, roleId: s.roleId };
    });
    await page.evaluate(() => __APP__.openRuleDrawer());
    await typeInto(page, 'ruleId', 'RULE-BLOCK-T2');
    await setSelect(page, 'ruleType', 'BLOCK');
    await setSelect(page, 'rulePerson', t.pid);
    await setSelect(page, 'ruleBlockOperator', 'cannot change role');
    await page.click('#drawerSave');
    await page.evaluate(sid => __APP__.approveSuccessor(sid), t.sid);
    const inc = await page.evaluate(t => __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId, t);
    assert(inc !== t.pid, 'cannot-change-role enforced');
    await page.evaluate(() => { __APP__.deleteRule; }); // noop guard
    dialogs = [];
    await page.evaluate(() => __APP__.openRuleDrawer('RULE-BLOCK-T2'));
    await page.click('[data-action="deleteRule"]');
    assert(await page.evaluate(() => !__APP__.rules.some(r => r.id === 'RULE-BLOCK-T2')), 'rule deleted');
  });
  await test('eligibility operators: pass = allowed, fail = blocked (equals/not equals/contains/not contains/list/AND)', async () => {
    const r = await page.evaluate(() => {
      const mk = (op, field, value) => ({ id: 'X', name: 'x', type: 'FIELD_RULE', scope: 'Candidate', field, operator: op, value: JSON.stringify([{ field, operator: op, value }]), severity: 'Block', message: 'x', enabled: true });
      const results = [];
      const probe = { personId: '__nobody__', roleId: '__norole__', readiness: 'Ready Now', source: 'Internal', candidateType: 'Successor', confidence: 'High' };
      const run = rule => { __APP__.rules.push(rule); const e = __APP__.evaluateRules(probe); __APP__.rules.pop(); return e.blocks.length > 0; };
      // probe MEETS the requirement -> not blocked; FAILS it -> blocked
      results.push(run(mk('equals', 'readiness', 'Ready Now')) === false);
      results.push(run(mk('equals', 'readiness', '3-5 Years')) === true);
      results.push(run(mk('not equals', 'readiness', '3-5 Years')) === false);
      results.push(run(mk('contains', 'candidateType', 'success')) === false);
      results.push(run(mk('contains', 'candidateType', 'athlete')) === true);
      results.push(run(mk('not contains', 'candidateType', 'athlete')) === false);
      results.push(run(mk('list', 'source', 'Internal|External')) === false);
      results.push(run(mk('list', 'source', 'External|Agency')) === true);
      // multi-requirement AND: readiness passes but source fails -> blocked
      const multi = { id: 'X2', name: 'x', type: 'FIELD_RULE', scope: 'Candidate', field: 'readiness', operator: 'equals', value: JSON.stringify([{ field: 'readiness', operator: 'equals', value: 'Ready Now' }, { field: 'source', operator: 'equals', value: 'External' }]), severity: 'Block', message: 'x', enabled: true };
      results.push(run(multi) === true);
      return results;
    });
    assert(r.every(Boolean), 'operator matrix: ' + JSON.stringify(r));
  });
  await test('create eligibility rule with contains via drawer UI (pass allowed, fail flagged)', async () => {
    await page.evaluate(() => __APP__.openRuleDrawer());
    await typeInto(page, 'ruleId', 'RULE-CONTAINS-T');
    await typeInto(page, 'ruleName', 'Interim candidates only');
    await setSelect(page, 'ruleSeverity', 'Needs Review');
    await page.evaluate(() => {
      const row = document.querySelector('#conditionRows .condition-row');
      row.querySelector('.condField').value = 'candidateType';
      row.querySelector('.condField').dispatchEvent(new Event('change', { bubbles: true }));
      row.querySelector('.condOperator').value = 'contains';
      row.querySelector('.condOperator').dispatchEvent(new Event('change', { bubbles: true }));
      row.querySelector('.condValueText').value = 'Interim';
    });
    await page.click('#drawerSave');
    const rule = await page.evaluate(() => __APP__.rules.find(r => r.id === 'RULE-CONTAINS-T'));
    assert(rule && rule.enabled, 'saved');
    const conds = JSON.parse(rule.value);
    assertEq(conds[0].operator, 'contains'); assertEq(conds[0].value, 'Interim');
    const res = await page.evaluate(() => {
      const probe = extra => __APP__.evaluateRules({ personId: 'x', roleId: 'y', readiness: 'Ready Now', source: 'Internal', confidence: 'High', ...extra }).reviews.some(m => m.includes('Interim candidates only'));
      return { failing: probe({ candidateType: 'Successor' }), passing: probe({ candidateType: 'Interim Candidate' }) };
    });
    assert(res.failing, 'candidate who fails the requirement is flagged');
    assert(!res.passing, 'candidate who meets the requirement moves freely');
  });
  await test('legacy BLOCK rule without operator/target is inferred as "cannot change role"', async () => {
    await loadBase(page);
    const r = await page.evaluate(() => __APP__.rules.find(x => x.id === 'RULE-005'));
    assertEq(r.operator, 'cannot change role', 'operator inferred on load');
    const blocked = await page.evaluate(() => {
      // give P006 a current role temporarily, then try to move them elsewhere
      __APP__.roles.push({ id: 'R-P006-TMP', title: 'Tmp', level: 'VP', department: '', boardId: '', managerRoleId: '', incumbentPersonId: 'P006', incumbentName: 'Nora Mitchell', risk: 'Low', criticality: 'Low', owner: '', status: '', sortOrder: 999 });
      const e = __APP__.evaluateRules({ personId: 'P006', roleId: 'R-CEO', readiness: 'Ready Now', source: 'Internal', confidence: 'High', candidateType: 'Successor' });
      __APP__.roles.pop();
      return e.blocks.length > 0;
    });
    assert(blocked, 'P006 blocked from changing roles');
  });
  await test('rule enable/disable switch persists and changes behavior', async () => {
    // disable RULE-001 (blocks non-ready) then a non-ready approve goes through with warnings
    await page.click('[data-action="tab"][data-tab-id="RULES"]');
    await page.click('[data-change="ruleToggle"][data-rule-id="RULE-001"]');
    let enabled = await page.evaluate(() => __APP__.rules.find(r => r.id === 'RULE-001').enabled);
    assertEq(enabled, false, 'disabled');
    let rows = parseCsvRows(await csvOf(page));
    assertEq(rows.find(r => r.ruleId === 'RULE-001').ruleEnabled, 'false', 'CSV enabled=false');
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.readiness === '1-2 Years' && s.source !== 'External'
        && __APP__.people.find(p => p.id === s.personId)?.mobility !== 'No'
        && __APP__.roles.some(r => r.id === s.roleId));
      return { sid: s.id, pid: s.personId, roleId: s.roleId };
    });
    await page.evaluate(sid => __APP__.approveSuccessor(sid), t.sid);
    const inc = await page.evaluate(t => __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId, t);
    assertEq(inc, t.pid, 'approve allowed once rule disabled');
    await page.click('[data-change="ruleToggle"][data-rule-id="RULE-001"]');
    enabled = await page.evaluate(() => __APP__.rules.find(r => r.id === 'RULE-001').enabled);
    assertEq(enabled, true, 're-enabled');
  });
  await test('AUTO_BACKFILL by candidate type fills a vacancy (via drawer UI)', async () => {
    await loadBase(page);
    await page.evaluate(() => __APP__.openRuleDrawer());
    await typeInto(page, 'ruleId', 'RULE-AB-T');
    await setSelect(page, 'ruleType', 'AUTO_BACKFILL');
    await setSelect(page, 'autoTypeSelect', 'Emergency Successor');
    await page.click('#drawerSave');
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.candidateType === 'Emergency Successor' && __APP__.people.some(p => p.id === s.personId) && __APP__.roles.some(r => r.id === s.roleId && !__APP__.isRoleVacant(r)));
      const top = __APP__.slateFor(s.roleId).filter(x => x.candidateType.includes('Emergency Successor'))[0];
      return { roleId: s.roleId, expectPid: top.personId };
    });
    await page.evaluate(rid => {
      const r = __APP__.roles.find(x => x.id === rid);
      r.incumbentPersonId = ''; r.incumbentName = 'VACANT';
      __APP__.runVacancyAutomation(rid); __APP__.render();
    }, t.roleId);
    const inc = await page.evaluate(t => __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId, t);
    assertEq(inc, t.expectPid, 'top emergency successor backfilled');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'RULE' && r.ruleId === 'RULE-AB-T'), 'rule in CSV');
  });
  await test('AUTO_BACKFILL custom mapping fills a vacancy with the mapped person', async () => {
    await loadBase(page);
    // disable the CSV's own backfill rule so the custom mapping is what fires
    await page.evaluate(() => { __APP__.rules.filter(r => r.type === 'AUTO_BACKFILL').forEach(r => r.enabled = false); });
    const t = await page.evaluate(() => {
      const r = __APP__.roles.find(r => !__APP__.isRoleVacant(r));
      const incumbents = new Set(__APP__.roles.map(x => x.incumbentPersonId));
      const p = __APP__.people.find(p => !incumbents.has(p.id));
      return { roleId: r.id, pid: p.id };
    });
    await page.evaluate(() => __APP__.openRuleDrawer());
    await typeInto(page, 'ruleId', 'RULE-AB-CUSTOM');
    await setSelect(page, 'ruleType', 'AUTO_BACKFILL');
    await setSelect(page, 'autoTypeSelect', 'Custom');
    await page.click('[data-action="addCustomMapRow"]');
    await page.evaluate(t => {
      const row = document.querySelector('#customMapRows .custom-map-row');
      row.querySelector('.customRole').value = t.roleId;
      row.querySelector('.customPerson').value = t.pid;
    }, t);
    await page.click('#drawerSave');
    await page.evaluate(rid => {
      const r = __APP__.roles.find(x => x.id === rid);
      r.incumbentPersonId = ''; r.incumbentName = 'VACANT';
      __APP__.runVacancyAutomation(rid); __APP__.render();
    }, t.roleId);
    const inc = await page.evaluate(t => __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId, t);
    assertEq(inc, t.pid, 'custom-mapped person moved in');
  });

  /* ===================================================================
     7. UNDO / RESET / CLEAR / HISTORY
     =================================================================== */
  section('7. Undo, reset, clear, history');
  await loadBase(page);
  await test('undo restores state exactly after a chain of mutations', async () => {
    const csv0 = await csvOf(page);
    await page.evaluate(() => {
      const p = __APP__.people[0], r = __APP__.roles.find(r => !__APP__.successors.some(s => s.roleId === r.id && s.personId === p.id));
      __APP__.addSuccessor(p.id, r.id);
    });
    await page.evaluate(() => __APP__.moveRank(__APP__.slateFor('R-CEO')[1].id, -1));
    const rid = await page.evaluate(() => { const r = __APP__.roles[10]; __APP__.openRoleDrawer(r.id); return r.id; });
    await typeInto(page, 'rTitle', 'Renamed For Undo');
    await page.click('#drawerSave');
    assert((await counts(page)).undo >= 3, 'undo stack grew');
    await page.evaluate(() => __APP__.undoLastAction());
    await page.evaluate(() => __APP__.undoLastAction());
    await page.evaluate(() => __APP__.undoLastAction());
    const csv1 = await csvOf(page);
    // history rows may differ (log entries), compare everything except HISTORY
    const strip = t => t.split('\n').filter(l => !l.startsWith('HISTORY')).join('\n');
    assertEq(strip(csv1), strip(csv0), 'state identical after 3 undos');
  });
  await test('undo with empty stack warns gracefully', async () => {
    await loadBase(page);
    await page.evaluate(() => __APP__.undoLastAction());
    assertEq((await lastMsg(page)).type, 'WARN');
  });
  await test('Ctrl+Z keyboard undo works outside inputs', async () => {
    const n0 = await page.evaluate(() => { const p = __APP__.people[3]; __APP__.addSuccessor(p.id, 'R-CEO'); return __APP__.slateFor('R-CEO').length; });
    await page.click('h2#viewTitle'); // focus body area
    await page.keyboard.press('Control+z');
    const n1 = await page.evaluate(() => __APP__.slateFor('R-CEO').length);
    assertEq(n1, n0 - 1, 'undone via keyboard');
  });
  await test('reset org changes returns to import baseline but keeps new records', async () => {
    await loadBase(page);
    const baseCsvNorm = (await csvOf(page)).split('\n').filter(l => l.startsWith('ROLE') || l.startsWith('SUCCESSOR')).join('\n');
    // make org changes: approve someone, add successor
    await page.evaluate(() => {
      __APP__.rules.find(r => r.id === 'RULE-001').enabled = false;
      const s = __APP__.successors[0];
      __APP__.approveSuccessor(s.id);
      __APP__.addSuccessor(__APP__.people[5].id, 'R-CEO');
    });
    // add a brand new person + rule that must survive
    await page.evaluate(() => {
      __APP__.people.push({ id: 'P-KEEP', name: 'Keep Me', title: '', department: '', email: '', location: '', jobLevel: '', readiness: 'Ready Now', source: 'Internal', candidateType: 'Successor', confidence: 'High', performance: '', potential: '', retentionRisk: '', mobility: '', criticalExperience: '', skills: '', notes: '' });
    });
    dialogs = [];
    await page.evaluate(() => __APP__.resetOrgChanges());
    assert(dialogs.length === 1, 'confirm shown');
    const after = await csvOf(page);
    const afterNorm = after.split('\n').filter(l => l.startsWith('ROLE') || l.startsWith('SUCCESSOR')).join('\n');
    assertEq(afterNorm, baseCsvNorm, 'roles+slates restored to baseline');
    assert(after.includes('P-KEEP'), 'new person kept');
  });
  await test('clear all empties everything and undo brings it back', async () => {
    await loadBase(page);
    dialogs = [];
    await page.evaluate(() => __APP__.clearAll());
    let c = await counts(page);
    assertEq(c.roles, 0); assertEq(c.people, 0);
    await page.evaluate(() => __APP__.undoLastAction());
    c = await counts(page);
    assertEq(c.roles, 72); assertEq(c.people, 150);
  });
  await test('history entries persist through CSV round-trip', async () => {
    await page.evaluate(() => __APP__.addSuccessor(__APP__.people[7].id, 'R-COO'));
    const csv = await csvOf(page);
    assert(csv.includes('Candidate Added'), 'history in CSV');
    await loadBase(page, csv);
    const h = await page.evaluate(() => __APP__.history.some(h => h.action === 'Candidate Added'));
    assert(h, 'history restored');
  });

  /* ===================================================================
     8. TABS / BOARDS MANAGEMENT + CUSTOM VALUES
     =================================================================== */
  section('8. Tabs & custom values');
  await loadBase(page);
  await test('add a custom tab via Manage Tabs drawer; persists as BOARD row', async () => {
    await clickAction(page, 'toggleMenu');
    await page.click('#moreMenu [data-action="manageTabs"]');
    await page.click('[data-action="addBoardRow"]');
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#boardRows .tab-row');
      const last = rows[rows.length - 1];
      last.querySelector('.bId').value = 'BOARD-TEST';
      last.querySelector('.bName').value = 'Test Board';
    });
    await page.click('#drawerSave');
    assert(await page.evaluate(() => __APP__.boards.some(b => b.id === 'BOARD-TEST')), 'board added');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'BOARD' && r.boardId === 'BOARD-TEST' && r.boardName === 'Test Board'), 'BOARD row in CSV');
    assert(await page.locator('[data-action="tab"][data-tab-id="BOARD-TEST"]').count() === 1, 'tab rendered');
  });
  await test('assign role to new board via role drawer; appears on that tab', async () => {
    await page.evaluate(() => __APP__.openRoleDrawer('R-CEO'));
    await setSelect(page, 'rBoard', 'BOARD-TEST');
    await page.click('#drawerSave');
    await page.click('[data-action="tab"][data-tab-id="BOARD-TEST"]');
    assertEq(await page.locator('.role').count(), 1, 'one role on new board');
  });
  await test('removing a tab keeps roles but removes the tab; active tab falls back', async () => {
    await clickAction(page, 'toggleMenu');
    await page.click('#moreMenu [data-action="manageTabs"]');
    await page.evaluate(() => {
      [...document.querySelectorAll('#boardRows .tab-row')].forEach(row => {
        if (row.querySelector('.bId').value === 'BOARD-TEST') row.remove();
      });
    });
    await page.click('#drawerSave');
    assert(await page.evaluate(() => !__APP__.boards.some(b => b.id === 'BOARD-TEST')), 'board removed');
    assertEq(await page.evaluate(() => __APP__.activeTab), 'MASTER', 'fell back to MASTER');
    assertEq((await counts(page)).roles, 72, 'roles kept');
  });
  await test('custom dropdown value added via the small modal persists to CSV', async () => {
    await page.evaluate(() => __APP__.openPersonDrawer('P001'));
    await setSelect(page, 'pReady', '__ADD__');
    await page.waitForSelector('#smallValueInput');
    await page.fill('#smallValueInput', 'Ready In 6 Months');
    await page.click('#smallAdd');
    const selVal = await page.evaluate(() => document.getElementById('pReady').value);
    assertEq(selVal, 'Ready In 6 Months', 'new value selected');
    await page.click('#drawerSave');
    const p = await page.evaluate(() => __APP__.people.find(x => x.id === 'P001').readiness);
    assertEq(p, 'Ready In 6 Months');
    const rows = parseCsvRows(await csvOf(page));
    const setting = rows.find(r => r.recordType === 'SETTING');
    assert(setting.settingValue.includes('Ready In 6 Months'), 'custom value in SETTING row');
    // and it shows up in the filter bar after render
    const inFilter = await page.evaluate(() => [...document.getElementById('readinessFilter').options].some(o => o.value === 'Ready In 6 Months'));
    assert(inFilter, 'available in filters');
  });
  await test('add manager role inline from role form (+ Add new manager role…)', async () => {
    const n = (await counts(page)).roles;
    await page.evaluate(() => __APP__.openRoleDrawer());
    await setSelect(page, 'rManager', '__ADD__');
    await page.waitForSelector('#smallValueInput');
    await page.fill('#smallValueInput', 'Interim Chief of Staff');
    await page.click('#smallAdd');
    assertEq((await counts(page)).roles, n + 1, 'manager role created');
    const sel = await page.evaluate(() => document.getElementById('rManager').value);
    assert(sel.startsWith('R-INTERIM'), 'new manager selected: ' + sel);
    await clickAction(page, 'closeDrawer');
  });

  /* ===================================================================
     9. DATA HYGIENE: duplicates, dangling refs, malformed CSV
     =================================================================== */
  section('9. Data hygiene & hostile input');
  await test('duplicate people and slate rows are consolidated on load', async () => {
    const csv = ['recordType,personId,personName,personTitle,readiness,roleId,roleTitle,level,successorRoleId,ranking,candidateType,approved,autoMoveQueued',
      'PERSON,P1,Alice,,Ready Now,,,,,,,,',
      'PERSON,P1,,Engineer,,,,,,,,,',        // dup fills title
      'ROLE,,,,,R-A,Role A,VP,,,,,',
      'SUCCESSOR,P1,,,3-5 Years,S1,,,R-A,1,Successor,false,false',
      'SUCCESSOR,P1,,,Ready Now,S2,,,R-A,2,Emergency Successor,true,false',
    ].map(l => { // expand to full header
      return l;
    }).join('\n');
    // build a proper full-width CSV instead
    const H = await page.evaluate(() => window.__APP__ && Object.keys ? null : null);
    const full = (() => {
      const headers = 'recordType,boardId,boardName,roleId,roleTitle,level,department,managerRoleId,incumbentPersonId,incumbentName,risk,criticality,owner,status,sortOrder,personId,personName,personTitle,personDepartment,personEmail,location,jobLevel,performance,potential,retentionRisk,mobility,criticalExperience,skills,readiness,source,candidateType,confidence,ranking,notes,successorRoleId,approved,autoMoveQueued,ruleId,ruleName,ruleType,ruleScope,ruleField,ruleOperator,ruleValue,rulePersonId,ruleTargetRoleId,ruleAltPersonId,ruleSeverity,ruleMessage,ruleEnabled,historyId,historyDate,historyAction,historyDetails,settingKey,settingValue'.split(',');
      const row = o => headers.map(h => o[h] || '').join(',');
      return [headers.join(','),
        row({ recordType: 'PERSON', personId: 'P1', personName: 'Alice', readiness: 'Ready Now' }),
        row({ recordType: 'PERSON', personId: 'P1', personTitle: 'Engineer' }),
        row({ recordType: 'ROLE', roleId: 'R-A', roleTitle: 'Role A', level: 'VP' }),
        row({ recordType: 'SUCCESSOR', roleId: 'S1', successorRoleId: 'R-A', personId: 'P1', readiness: '3-5 Years', candidateType: 'Successor', ranking: '1' }),
        row({ recordType: 'SUCCESSOR', roleId: 'S2', successorRoleId: 'R-A', personId: 'P1', readiness: 'Ready Now', candidateType: 'Emergency Successor', ranking: '2', approved: 'true' }),
      ].join('\n');
    })();
    await loadBase(page, full);
    const st = await page.evaluate(() => ({ people: __APP__.people, succ: __APP__.successors, msg: __APP__.messages.map(m => m.message) }));
    assertEq(st.people.length, 1, 'people merged');
    assertEq(st.people[0].title, 'Engineer', 'blank field filled from dup');
    assertEq(st.succ.length, 1, 'slate rows merged');
    assertEq(st.succ[0].readiness, 'Ready Now', 'best readiness kept');
    assert(st.succ[0].candidateType.includes('Successor') && st.succ[0].candidateType.includes('Emergency Successor'), 'types merged');
    assertEq(st.succ[0].approved, true, 'approved kept');
    assert(st.msg.some(m => m.includes('merged')), 'merge notice shown');
  });
  await test('dangling successor references produce ERR notices, no crash', async () => {
    const headers = 'recordType,boardId,boardName,roleId,roleTitle,level,department,managerRoleId,incumbentPersonId,incumbentName,risk,criticality,owner,status,sortOrder,personId,personName,personTitle,personDepartment,personEmail,location,jobLevel,performance,potential,retentionRisk,mobility,criticalExperience,skills,readiness,source,candidateType,confidence,ranking,notes,successorRoleId,approved,autoMoveQueued,ruleId,ruleName,ruleType,ruleScope,ruleField,ruleOperator,ruleValue,rulePersonId,ruleTargetRoleId,ruleAltPersonId,ruleSeverity,ruleMessage,ruleEnabled,historyId,historyDate,historyAction,historyDetails,settingKey,settingValue'.split(',');
    const row = o => headers.map(h => o[h] || '').join(',');
    const bad = [headers.join(','),
      row({ recordType: 'SUCCESSOR', roleId: 'SX', successorRoleId: 'R-GHOST', personId: 'P-GHOST', ranking: '1' }),
    ].join('\n');
    await loadBase(page, bad);
    const msgs = await page.evaluate(() => __APP__.messages.map(m => m.type + ':' + m.message));
    assert(msgs.some(m => m.startsWith('ERR') && m.includes('P-GHOST')), 'missing person flagged');
    assert(msgs.some(m => m.startsWith('ERR') && m.includes('R-GHOST')), 'missing role flagged');
  });
  await test('empty / garbage / header-only CSV rejected without losing state', async () => {
    await loadBase(page);
    const before = await csvOf(page);
    for (const junk of ['', 'not,a,planner\n1,2,3', 'recordType\n']) {
      const ok = await page.evaluate(t => window.__APP__.loadCSV(t), junk);
      assert(ok === false, 'rejected: ' + JSON.stringify(junk.slice(0, 20)));
    }
    assertEq(await csvOf(page), before, 'state untouched');
  });
  await test('approve with dangling person is handled gracefully', async () => {
    await page.evaluate(() => {
      __APP__.successors.push({ id: 'S-DANGLE', roleId: 'R-CEO', personId: 'P-NOPE', readiness: 'Ready Now', source: 'Internal', candidateType: 'Successor', confidence: 'High', ranking: 99, notes: '', approved: false, autoMoveQueued: false });
      __APP__.approveSuccessor('S-DANGLE');
    });
    assertEq((await lastMsg(page)).type, 'ERR', 'graceful error');
    await page.evaluate(() => { __APP__.removeSuccessor; });
  });

  /* ===================================================================
     10. INSIGHTS TAB
     =================================================================== */
  section('10. Insights');
  await loadBase(page);
  await test('insights KPIs match computed reality', async () => {
    await page.click('[data-action="tab"][data-tab-id="INSIGHTS"]');
    const expected = await page.evaluate(() => {
      const roles = __APP__.roles, ss = __APP__.successors;
      const covered = roles.filter(r => ss.some(s => s.roleId === r.id)).length;
      const ready = roles.filter(r => ss.some(s => s.roleId === r.id && String(s.readiness).toLowerCase() === 'ready now')).length;
      const vacant = roles.filter(r => __APP__.isRoleVacant(r)).length;
      return { total: roles.length, covPct: Math.round(covered / roles.length * 100), readyPct: Math.round(ready / roles.length * 100), vacant };
    });
    const kpiText = await page.evaluate(() => [...document.querySelectorAll('.kpi b')].map(b => b.textContent));
    assertEq(kpiText[0], String(expected.total), 'roles KPI');
    assertEq(kpiText[1], expected.covPct + '%', 'coverage KPI');
    assertEq(kpiText[2], expected.readyPct + '%', 'ready-now KPI');
    assertEq(kpiText[3], String(expected.vacant), 'vacant KPI');
    assert(await page.locator('.insight-card').count() >= 4, 'insight cards render');
  });
  await test('insights respects department filter', async () => {
    await setSelect(page, 'deptFilter', 'Finance');
    const expected = await page.evaluate(() => __APP__.roles.filter(r => r.department === 'Finance').length);
    const kpi = await page.evaluate(() => document.querySelector('.kpi b').textContent);
    assertEq(kpi, String(expected), 'filtered role count');
    await setSelect(page, 'deptFilter', 'All Departments');
  });

  /* ===================================================================
     11. DIRTY STATE / BACKUP / KEYBOARD
     =================================================================== */
  section('11. Dirty state, backup, shortcuts');
  await test('mutations set dirty; load clears it', async () => {
    await loadBase(page);
    assertEq((await counts(page)).dirty, false, 'clean after load');
    await page.evaluate(() => __APP__.addSuccessor(__APP__.people[9].id, 'R-COO'));
    assertEq((await counts(page)).dirty, true, 'dirty after change');
  });
  await test('local backup auto-restores the whole session after reload (no clicks)', async () => {
    await page.waitForTimeout(1200); // backup debounce
    const hasBackup = await page.evaluate(() => !!localStorage.getItem('succession_planner_backup_v1'));
    assert(hasBackup, 'backup written');
    await page.reload();
    await page.waitForFunction(() => window.__APP__ && __APP__.roles.length > 0);
    const c = await counts(page);
    assertEq(c.roles, 72, 'roles auto-restored');
    assert(c.people >= 150, 'people auto-restored');
    assertEq(c.dirty, true, 'unsaved work still flagged as unsaved');
    assert(await page.locator('.banner').count() >= 1, 'restore banner explains what happened');
    await page.click('[data-action="dismissBanner"]');
  });
  await test('Escape closes drawer; drawer backdrop click closes', async () => {
    await page.evaluate(() => __APP__.openPersonDrawer('P001'));
    await page.keyboard.press('Escape');
    const open = await page.evaluate(() => document.getElementById('drawer').classList.contains('open'));
    assert(!open, 'closed via Escape');
  });

  /* ===================================================================
     12. SCALE / PERFORMANCE
     =================================================================== */
  section('12. Scale & performance');
  await test('3,000 people / 800 roles / 4,000 slate rows load + render + round-trip < 15s', async () => {
    const big = await page.evaluate(() => {
      const H = ['recordType','boardId','boardName','roleId','roleTitle','level','department','managerRoleId','incumbentPersonId','incumbentName','risk','criticality','owner','status','sortOrder','personId','personName','personTitle','personDepartment','personEmail','location','jobLevel','performance','potential','retentionRisk','mobility','criticalExperience','skills','readiness','source','candidateType','confidence','ranking','notes','successorRoleId','approved','autoMoveQueued','ruleId','ruleName','ruleType','ruleScope','ruleField','ruleOperator','ruleValue','rulePersonId','ruleTargetRoleId','ruleAltPersonId','ruleSeverity','ruleMessage','ruleEnabled','historyId','historyDate','historyAction','historyDetails','settingKey','settingValue'];
      const row = o => H.map(h => o[h] || '').join(',');
      const lines = [H.join(',')];
      const depts = ['Eng', 'Sales', 'HR', 'Fin', 'Ops'];
      const levels = ['C-Suite', 'VP', 'Director', 'Manager'];
      for (let i = 0; i < 3000; i++) lines.push(row({ recordType: 'PERSON', personId: 'BP' + i, personName: 'Person ' + i, personDepartment: depts[i % 5], readiness: i % 3 === 0 ? 'Ready Now' : '1-2 Years', candidateType: 'Successor' }));
      for (let i = 0; i < 800; i++) lines.push(row({ recordType: 'ROLE', roleId: 'BR' + i, roleTitle: 'Role ' + i, level: levels[i % 4], department: depts[i % 5], managerRoleId: i ? 'BR' + Math.floor((i - 1) / 4) : '', incumbentPersonId: i % 7 === 0 ? '' : 'BP' + i, incumbentName: i % 7 === 0 ? 'VACANT' : 'Person ' + i, risk: ['High', 'Medium', 'Low'][i % 3], sortOrder: i }));
      for (let i = 0; i < 4000; i++) lines.push(row({ recordType: 'SUCCESSOR', roleId: 'BS' + i, successorRoleId: 'BR' + (i % 800), personId: 'BP' + (i % 3000), readiness: i % 3 === 0 ? 'Ready Now' : '3-5 Years', candidateType: 'Successor', ranking: String(Math.floor(i / 800) + 1) }));
      return lines.join('\n');
    });
    const t1 = Date.now();
    await page.evaluate(t => window.__APP__.loadCSV(t), big);
    const loadMs = Date.now() - t1;
    const c = await counts(page);
    assertEq(c.people, 3000); assertEq(c.roles, 800); assertEq(c.succ, 4000);
    const t2 = Date.now();
    await page.evaluate(() => { __APP__.activeTab = 'ALL'; __APP__.render(); });
    const renderMs = Date.now() - t2;
    const t3 = Date.now();
    const csv = await csvOf(page);
    const rtMs = Date.now() - t3;
    await loadBase(page, csv);
    assertEq((await counts(page)).succ, 4000, 'big round-trip intact');
    console.log(`        load=${loadMs}ms renderAll=${renderMs}ms toCSV=${rtMs}ms`);
    assert(loadMs + renderMs + rtMs < 15000, 'performance budget');
  });
  await test('insights + people views render on the big dataset', async () => {
    await page.evaluate(() => { __APP__.activeTab = 'INSIGHTS'; __APP__.render(); });
    assert(await page.locator('.kpi').count() >= 4, 'insights ok');
    await page.evaluate(() => { __APP__.activeTab = 'PEOPLE'; __APP__.render(); });
    assert((await page.locator('.table tbody tr').count()) <= 401, 'people table capped for perf');
  });

  /* ===================================================================
     13. CHESS VIEW
     =================================================================== */
  section('13. Chess view');
  await loadBase(page);
  await page.click('[data-action="tab"][data-tab-id="ALL"]');

  await test('chess view opens from a role card: king + pieces by rank', async () => {
    await page.click('.role[data-role-id="R-CEO"] [data-action="openChess"]');
    assert(!(await page.evaluate(() => document.getElementById('chessOverlay').classList.contains('hidden'))), 'overlay open');
    const slate = await page.evaluate(() => __APP__.slateFor('R-CEO').length);
    assertEq(await page.locator('#chessOverlay .square').count(), slate, 'one square per candidate');
    const throne = await page.locator('#chessOverlay .throne .t-name').textContent();
    const inc = await page.evaluate(() => __APP__.people.find(p => p.id === __APP__.roles.find(r => r.id === 'R-CEO').incumbentPersonId).name);
    assertEq(throne.trim(), inc, 'incumbent on the throne');
    const firstRank = await page.locator('#chessOverlay .square .prank').first().textContent();
    assert(firstRank.includes('Queen') && firstRank.includes('1st'), 'top candidate is the Queen: ' + firstRank);
  });
  await test('dragging one piece onto another swaps their places (staged only)', async () => {
    const before = await page.evaluate(() => ({ order: [...__APP__.chess.order], ranks: __APP__.slateFor('R-CEO').map(s => s.id) }));
    assert(before.order.length >= 2, 'needs 2+ pieces');
    const a = before.order[0], b = before.order[before.order.length - 1];
    await simulateDrag(page, `#chessOverlay .square[data-succ-id="${a}"]`, `#chessOverlay .square[data-succ-id="${b}"]`);
    const after = await page.evaluate(() => ({ order: [...__APP__.chess.order], ranks: __APP__.slateFor('R-CEO').map(s => s.id), dirty: __APP__.chess.dirtyMoves }));
    assertEq(after.order[0], b, 'swapped: last piece now first');
    assertEq(after.order[after.order.length - 1], a, 'swapped: first piece now last');
    assertEq(after.ranks.join(','), before.ranks.join(','), 'real rankings untouched before save');
    assert(after.dirty, 'marked as unsaved moves');
    assert(await page.locator('#chessOverlay .pending-chip').count() === 1, 'Unsaved moves chip shown');
  });
  await test('saving the board persists the new order to state and CSV', async () => {
    const staged = await page.evaluate(() => [...__APP__.chess.order]);
    await page.click('[data-action="chessSave"]');
    assert(await page.evaluate(() => !__APP__.chess), 'overlay closed after save');
    const ranks = await page.evaluate(() => __APP__.slateFor('R-CEO').map(s => s.id));
    assertEq(ranks.join(','), staged.join(','), 'order applied');
    const rows = parseCsvRows(await csvOf(page));
    const first = rows.find(r => r.recordType === 'SUCCESSOR' && r.roleId === staged[0]);
    assertEq(first.ranking, '1', 'CSV ranking updated');
  });
  await test('staging a rule-blocked candidate shows the callout and Save refuses', async () => {
    await loadBase(page);
    const t = await page.evaluate(() => {
      const s = __APP__.slateFor('R-CEO').find(s => s.readiness !== 'Ready Now');
      return { sid: s.id, inc: __APP__.roles.find(r => r.id === 'R-CEO').incumbentPersonId };
    });
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    await simulateDrag(page, `#chessOverlay .square[data-succ-id="${t.sid}"]`, `#chessOverlay .throne`);
    assert(await page.locator('#chessOverlay .notice.err').count() >= 1, 'block callout shown');
    assert(await page.locator('#chessOverlay .throne.staged').count() === 1, 'throne staged');
    await page.click('[data-action="chessSave"]');
    assert(await page.evaluate(() => !!__APP__.chess), 'save refused, board stays open');
    const inc = await page.evaluate(() => __APP__.roles.find(r => r.id === 'R-CEO').incumbentPersonId);
    assertEq(inc, t.inc, 'incumbent unchanged');
    await page.evaluate(() => __APP__.closeChessView(true));
  });
  await test('taking the seat: vacancy callout, steps-down note, save applies + persists', async () => {
    await loadBase(page);
    const t = await page.evaluate(() => {
      const s = __APP__.successors.find(s => s.readiness === 'Ready Now'
        && __APP__.people.some(p => p.id === s.personId)
        && __APP__.roles.some(r => r.id === s.roleId && !__APP__.isRoleVacant(r))
        && __APP__.roles.some(r => r.incumbentPersonId === s.personId && r.id !== s.roleId)
        && __APP__.evaluateRules(s).blocks.length === 0);
      const old = __APP__.roles.find(r => r.incumbentPersonId === s.personId);
      return { sid: s.id, pid: s.personId, roleId: s.roleId, oldRoleId: old.id };
    });
    await page.evaluate(rid => __APP__.openChessView(rid), t.roleId);
    await simulateDrag(page, `#chessOverlay .square[data-succ-id="${t.sid}"]`, `#chessOverlay .throne`);
    assert(await page.locator('#chessOverlay .throne.staged').count() === 1, 'staged on throne');
    assert(await page.locator('#chessOverlay .steps-down').count() === 1, 'steps-down note');
    const callouts = await page.evaluate(() => [...document.querySelectorAll('#chessOverlay .notice')].map(n => n.textContent).join(' | '));
    assert(callouts.includes('VACANT'), 'vacancy callout: ' + callouts.slice(0, 120));
    await page.click('[data-action="chessSave"]');
    const after = await page.evaluate(t => ({
      inc: __APP__.roles.find(r => r.id === t.roleId).incumbentPersonId,
      old: __APP__.roles.find(r => r.id === t.oldRoleId).status,
      open: !!__APP__.chess,
    }), t);
    assertEq(after.inc, t.pid, 'seat taken');
    assert(['Action Required', 'Auto Move'].includes(after.old), 'old role vacated/backfilled');
    assert(!after.open, 'board closed');
    const rows = parseCsvRows(await csvOf(page));
    assertEq(rows.find(r => r.recordType === 'ROLE' && r.roleId === t.roleId).incumbentPersonId, t.pid, 'CSV incumbent updated');
  });
  await test('closing with staged moves asks to discard and leaves state untouched', async () => {
    await loadBase(page);
    const before = await csvOf(page);
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    const order = await page.evaluate(() => [...__APP__.chess.order]);
    await simulateDrag(page, `#chessOverlay .square[data-succ-id="${order[0]}"]`, `#chessOverlay .square[data-succ-id="${order[1]}"]`);
    dialogs = [];
    await page.click('[data-action="chessClose"]');
    assert(dialogs.length === 1 && dialogs[0].message.includes('Discard'), 'discard confirm shown');
    assert(await page.evaluate(() => !__APP__.chess), 'closed');
    assertEq(await csvOf(page), before, 'no data changed');
  });
  await test('field picker applies to all pieces; program default persists in the CSV', async () => {
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    await page.click('[data-action="chessFieldsMenu"]');
    await page.click('#chessOverlay input[data-change="chessField"][data-field="department"]');
    let info = await page.locator('#chessOverlay .square .pinfo').first().textContent();
    assert(info.includes('Department'), 'department now shown on pieces');
    await page.click('[data-action="chessSetDefault"]');
    const def = await page.evaluate(() => __APP__.chessDefaultFields);
    assert(def.includes('department'), 'program default updated');
    const csv = await csvOf(page);
    const setting = parseCsvRows(csv).find(r => r.recordType === 'SETTING' && r.settingKey === 'chessFields');
    assert(setting && setting.settingValue.includes('department'), 'chessFields SETTING row written');
    await loadBase(page, csv);
    const def2 = await page.evaluate(() => __APP__.chessDefaultFields);
    assert(def2 && def2.includes('department'), 'default survives CSV round-trip');
  });

  await test('piece bank lists only off-slate people and search filters it', async () => {
    await loadBase(page);
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    const check = await page.evaluate(() => {
      const onSlate = new Set(__APP__.slateFor('R-CEO').map(s => s.personId));
      const inc = __APP__.roles.find(r => r.id === 'R-CEO').incumbentPersonId;
      const bankIds = [...document.querySelectorAll('.bank-piece')].map(x => x.dataset.personId);
      return { count: bankIds.length, clean: bankIds.every(id => !onSlate.has(id) && id !== inc) };
    });
    assert(check.count > 0, 'bank has pieces');
    assert(check.clean, 'nobody already on the slate or throne');
    const name = await page.evaluate(() => document.querySelector('.bank-piece .bp-main b').textContent);
    await page.fill('#chessBankSearch', name);
    await page.waitForTimeout(100);
    const filtered = await page.evaluate(() => [...document.querySelectorAll('.bank-piece .bp-main b')].map(b => b.textContent));
    assert(filtered.length >= 1 && filtered.every(n => n === name || n.includes(name)), 'search filters bank');
    await page.fill('#chessBankSearch', '');
  });
  await test('bank piece dropped on the open board stages a New pawn; Save creates the CSV row', async () => {
    const pid = await page.evaluate(() => document.querySelector('.bank-piece').dataset.personId);
    const before = await page.evaluate(() => __APP__.slateFor('R-CEO').length);
    await simulateDrag(page, `.bank-piece[data-person-id="${pid}"]`, `#chessOverlay .chess-grid`);
    const stagedState = await page.evaluate(pid => ({
      newFlag: document.querySelectorAll('#chessOverlay .square .new-flag').length,
      lastEntry: __APP__.chess.order[__APP__.chess.order.length - 1],
      real: __APP__.slateFor('R-CEO').length,
    }), pid);
    assertEq(stagedState.newFlag, 1, 'New badge on the staged piece');
    assertEq(stagedState.lastEntry, 'NEW::' + pid, 'staged at the end');
    assertEq(stagedState.real, before, 'no real row before save');
    await page.click('[data-action="chessSave"]');
    const after = await page.evaluate(pid => __APP__.successors.find(s => s.roleId === 'R-CEO' && s.personId === pid), pid);
    assert(after, 'slate row created on save');
    assertEq(after.ranking, before + 1, 'joined at the last rank');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'SUCCESSOR' && r.successorRoleId === 'R-CEO' && r.personId === pid), 'persisted to CSV');
  });
  await test('bank piece dropped on a square takes that exact spot', async () => {
    await loadBase(page);
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    const pid = await page.evaluate(() => document.querySelector('.bank-piece').dataset.personId);
    const firstEntry = await page.evaluate(() => __APP__.chess.order[0]);
    await simulateDrag(page, `.bank-piece[data-person-id="${pid}"]`, `#chessOverlay .square[data-succ-id="${firstEntry}"]`);
    const order = await page.evaluate(() => [...__APP__.chess.order]);
    assertEq(order[0], 'NEW::' + pid, 'staged into 1st-in-line (Queen) spot');
    assertEq(order[1], firstEntry, 'previous queen shifted down');
    // remove the staged piece — board returns to clean
    await page.click(`[data-action="chessRemoveNew"][data-entry-id="NEW::${pid}"]`);
    const order2 = await page.evaluate(() => [...__APP__.chess.order]);
    assertEq(order2[0], firstEntry, 'staged piece removed');
    await page.evaluate(() => __APP__.closeChessView(true));
  });
  await test('bank piece dropped on the throne takes the seat on save', async () => {
    await loadBase(page);
    const t = await page.evaluate(() => {
      const onSlate = new Set(__APP__.slateFor('R-CEO').map(s => s.personId));
      const inc = __APP__.roles.find(r => r.id === 'R-CEO').incumbentPersonId;
      const p = __APP__.people.find(p => !onSlate.has(p.id) && p.id !== inc
        && __APP__.evaluateRules({ personId: p.id, roleId: 'R-CEO', readiness: p.readiness || '1-2 Years', source: p.source || 'Internal', candidateType: p.candidateType || 'Successor', confidence: p.confidence || 'Medium' }).blocks.length === 0);
      return { pid: p.id, name: p.name };
    });
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    await page.fill('#chessBankSearch', t.pid);
    await page.waitForTimeout(100);
    await simulateDrag(page, `.bank-piece[data-person-id="${t.pid}"]`, `#chessOverlay .throne`);
    const throne = await page.locator('#chessOverlay .throne.staged .t-name').textContent();
    assertEq(throne.trim(), t.name, 'bank person staged on the throne');
    await page.click('[data-action="chessSave"]');
    const inc = await page.evaluate(() => __APP__.roles.find(r => r.id === 'R-CEO').incumbentPersonId);
    assertEq(inc, t.pid, 'seat taken on save');
    const rows = parseCsvRows(await csvOf(page));
    assertEq(rows.find(r => r.recordType === 'ROLE' && r.roleId === 'R-CEO').incumbentPersonId, t.pid, 'CSV updated');
  });
  await test('discarding staged bank additions leaves no trace', async () => {
    await loadBase(page);
    const before = await csvOf(page);
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    const pid = await page.evaluate(() => document.querySelector('.bank-piece').dataset.personId);
    await simulateDrag(page, `.bank-piece[data-person-id="${pid}"]`, `#chessOverlay .chess-grid`);
    dialogs = [];
    await page.click('[data-action="chessClose"]');
    assert(dialogs.length === 1, 'discard confirm shown');
    assertEq(await csvOf(page), before, 'nothing changed');
  });

  /* ===================================================================
     14. CSV SIMPLICITY (future columns, auto tabs, tree inference)
     =================================================================== */
  section('14. CSV simplicity for HR');
  await test('unknown CSV columns are preserved per record and written back', async () => {
    const headers = 'recordType,roleId,roleTitle,level,department,personId,personName,readiness,successorRoleId,ranking,costCenter,unionStatus';
    const csv = [headers,
      'PERSON,,,,,PX1,Casey Doe,Ready Now,,,CC-42,Non-union',
      'ROLE,RX1,Role X,VP,Ops,,,,,,CC-9,',
      'SUCCESSOR,SX1,,,,PX1,,Ready Now,RX1,1,CC-42,',
    ].join('\n');
    await loadBase(page, csv);
    const x = await page.evaluate(() => ({
      p: __APP__.people[0]._x, r: __APP__.roles[0]._x, cols: __APP__.extraColumnNames(),
    }));
    assertEq(x.p.costCenter, 'CC-42', 'person extra kept');
    assertEq(x.r.costCenter, 'CC-9', 'role extra kept');
    assert(x.cols.includes('costCenter') && x.cols.includes('unionStatus'), 'extra columns tracked');
    const out = await csvOf(page);
    assert(out.split('\n')[0].includes('costCenter'), 'extra column in exported header');
    const rows = parseCsvRows(out);
    assertEq(rows.find(r => r.personId === 'PX1' && r.recordType === 'PERSON').costCenter, 'CC-42', 'value round-trips');
    await loadBase(page, out);
    assertEq(await csvOf(page), out, 'byte-stable with extra columns');
  });
  await test('adding a field through the person drawer creates a new CSV column', async () => {
    await loadBase(page);
    await page.evaluate(() => __APP__.openPersonDrawer('P001'));
    await page.click('[data-action="addExtraField"]');
    await page.waitForSelector('#smallValueInput');
    await page.fill('#smallValueInput', 'T-Shirt Size');
    await page.click('#smallAdd');
    await page.evaluate(() => {
      const i = [...document.querySelectorAll('#drawerBody .extraField')].find(x => x.dataset.extraKey === 'T-Shirt Size');
      i.value = 'M';
    });
    await page.click('#drawerSave');
    const val = await page.evaluate(() => __APP__.people.find(p => p.id === 'P001')._x['T-Shirt Size']);
    assertEq(val, 'M', 'value saved on person');
    const out = await csvOf(page);
    assert(out.split('\n')[0].includes('T-Shirt Size'), 'new column in CSV template');
    // and the field now appears on every person's drawer
    await page.evaluate(() => __APP__.openPersonDrawer('P002'));
    assert(await page.evaluate(() => [...document.querySelectorAll('#drawerBody .extraField')].some(x => x.dataset.extraKey === 'T-Shirt Size')), 'field visible for other people');
    await clickAction(page, 'closeDrawer');
  });
  await test('a role row naming an unknown board auto-creates the tab from the CSV', async () => {
    const headers = 'recordType,boardId,roleId,roleTitle,level,department';
    const csv = [headers, 'ROLE,BOARD-TALENT-POOL,RT1,Pool Lead,VP,Ops'].join('\n');
    await loadBase(page, csv);
    const b = await page.evaluate(() => __APP__.boards.find(x => x.id === 'BOARD-TALENT-POOL'));
    assert(b, 'board auto-created');
    assertEq(b.name, 'Talent Pool', 'readable tab name');
    assert(await page.locator('[data-action="tab"][data-tab-id="BOARD-TALENT-POOL"]').count() === 1, 'tab rendered');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'BOARD' && r.boardId === 'BOARD-TALENT-POOL'), 'BOARD row written back');
  });
  await test('org tree infers SVP-over-VP family-tree lines; Apply makes them permanent', async () => {
    const headers = 'recordType,roleId,roleTitle,level,department,managerRoleId,personId,personName';
    const csv = [headers,
      'ROLE,RC,Chief Exec,CEO,Exec,,,',
      'ROLE,RS,SVP Sales,SVP,Sales,,,',
      'ROLE,RV,VP Sales,VP,Sales,,,',
      'ROLE,RD,Director Sales,Director,Sales,,,',
    ].join('\n');
    await loadBase(page, csv);
    const parents = await page.evaluate(() => {
      const m = __APP__.computeTreeParents();
      return Object.fromEntries([...m.entries()].map(([k, v]) => [k, v]));
    });
    assertEq(parents.RV.id, 'RS', 'VP under SVP (same dept)');
    assertEq(parents.RD.id, 'RV', 'Director under VP');
    assertEq(parents.RS.id, 'RC', 'SVP falls back to top role');
    assert(parents.RV.inferred && parents.RS.inferred, 'marked as inferred');
    assert(await page.locator('.node.inferred').count() === 3, 'dashed inferred nodes rendered');
    await page.click('[data-action="applyInferred"]');
    const mgr = await page.evaluate(() => __APP__.roles.find(r => r.id === 'RV').managerRoleId);
    assertEq(mgr, 'RS', 'managerRoleId written');
    const rows = parseCsvRows(await csvOf(page));
    assertEq(rows.find(r => r.recordType === 'ROLE' && r.roleId === 'RV').managerRoleId, 'RS', 'persisted to CSV');
    assert(await page.locator('[data-action="applyInferred"]').count() === 0, 'button gone once applied');
    await page.evaluate(() => __APP__.undoLastAction());
    const mgr2 = await page.evaluate(() => __APP__.roles.find(r => r.id === 'RV').managerRoleId);
    assertEq(mgr2, '', 'undo restores');
  });
  await test('starter template menu item downloads without breaking anything', async () => {
    await loadBase(page);
    await clickAction(page, 'toggleMenu');
    await page.click('#moreMenu [data-action="downloadTemplate"]');
    const msg = await lastMsg(page);
    assert(msg && msg.type === 'OK' && msg.message.includes('template'), 'template toast shown');
  });

  /* ===================================================================
     15. FILE MEMORY & SHEET IMPORTS (Excel-tab workflow)
     =================================================================== */
  section('15. File memory & sheet imports');
  await test('remembered file: reconnect banner reopens it and Save overwrites it', async () => {
    const supported = await page.evaluate(async () => { try { if (!navigator.storage || !navigator.storage.getDirectory) return false; await navigator.storage.getDirectory(); return true; } catch (e) { return false; } });
    if (!supported) { console.log('        OPFS unavailable in this browser — path skipped'); return; }
    await page.evaluate(async csv => {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle('remembered.csv', { create: true });
      const w = await fh.createWritable(); await w.write(csv); await w.close();
      await __APP__.idbSet('fileHandle', fh);
      localStorage.removeItem('succession_planner_backup_v1');
    }, BASE_CSV);
    await page.reload();
    await page.waitForSelector('[data-action="reconnectFile"]');
    await page.click('[data-action="reconnectFile"]');
    await page.waitForFunction(() => __APP__.roles.length === 72);
    const name = await page.evaluate(() => document.getElementById('dbStatus').textContent);
    assert(name.includes('remembered.csv'), 'connected to the remembered file: ' + name);
    await page.evaluate(() => __APP__.openPersonDrawer('P001'));
    await typeInto(page, 'pName', 'Reconnected Name');
    await page.click('#drawerSave');
    await page.click('[data-action="saveCSV"]');
    await page.waitForTimeout(400);
    const content = await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const fh = await root.getFileHandle('remembered.csv'); return (await fh.getFile()).text(); });
    assert(content.includes('Reconnected Name'), 'Save overwrote the connected file');
    assertEq((await counts(page)).dirty, false, 'clean after save');
    await page.evaluate(() => __APP__.forgetStoredFile());
  });
  await test('remembered-file banner survives reload; unusable handle fails gracefully', async () => {
    const idbOk = await page.evaluate(async () => { try { await __APP__.idbSet('probe', { v: 1 }); const r = await __APP__.idbGet('probe'); await __APP__.idbDel('probe'); return r && r.v === 1; } catch (e) { return false; } });
    assert(idbOk, 'IndexedDB key-value store works on this origin');
    await page.evaluate(async () => { await __APP__.idbSet('fileHandle', { name: 'my_database.csv' }); localStorage.removeItem('succession_planner_backup_v1'); });
    await page.reload();
    await page.waitForSelector('[data-action="reconnectFile"]');
    const banner = await page.evaluate(() => document.getElementById('banner').textContent);
    assert(banner.includes('my_database.csv'), 'banner names the remembered file');
    await page.click('[data-action="reconnectFile"]');
    await page.waitForTimeout(200);
    const msg = await lastMsg(page);
    assert(msg.type === 'ERR' && msg.message.includes('Open CSV'), 'unusable handle explains what to do instead');
    await page.evaluate(() => __APP__.forgetStoredFile());
    assert((await page.evaluate(() => document.getElementById('banner').textContent)) === '', 'forget clears the banner');
  });
  await test('people sheet merges with aliases, auto-IDs and extra columns; Apply persists', async () => {
    await loadBase(page);
    const sheet = 'Person ID,Name,Title,Department,Readiness,Shirt Size\n' +
      ',Pat New Hire,Ops Analyst,Operations,Ready Now,L\n' +
      'P001,Mei Smith,Chief of Staff,,Ready Now,M';
    await page.evaluate(t => __APP__.startSheetImport([{ name: 'people.csv', text: t }]), sheet);
    const rv = await page.evaluate(() => ({ stats: __APP__.importReview.stats, report: __APP__.importReview.report }));
    assertEq(rv.stats.peopleAdded, 1, 'one new person'); assertEq(rv.stats.peopleUpdated, 1, 'one update');
    assert(rv.report.some(r => r.severity === 'WARNING' && r.action.startsWith('Generated P-PAT')), 'auto-ID warning listed');
    assert(await page.evaluate(() => !__APP__.people.some(p => p.name === 'Pat New Hire')), 'nothing applied before Apply Import');
    await page.click('#drawerSave'); // Apply Import
    const after = await page.evaluate(() => ({ pat: __APP__.people.find(p => p.name === 'Pat New Hire'), mei: __APP__.people.find(p => p.id === 'P001') }));
    assert(after.pat && after.pat.id.startsWith('P-PAT'), 'added with generated ID');
    assertEq(after.pat._x['Shirt Size'], 'L', 'unknown column kept as an extra field');
    assertEq(after.mei.title, 'Chief of Staff', 'existing person updated by ID');
    assert(after.mei.department, 'blank cells do not wipe existing values');
    const rows = parseCsvRows(await csvOf(page));
    assert(rows.some(r => r.recordType === 'PERSON' && r.personName === 'Pat New Hire'), 'persisted to the CSV');
  });
  await test('slate sheet resolves role titles and person names; dangling refs are skipped with errors', async () => {
    await loadBase(page);
    const pick = await page.evaluate(() => {
      const onSlate = new Set(__APP__.successors.filter(s => s.roleId === 'R-CEO').map(s => s.personId));
      const cnt = {}; __APP__.people.forEach(p => cnt[p.name] = (cnt[p.name] || 0) + 1);
      const inc = __APP__.roles.find(r => r.id === 'R-CEO').incumbentPersonId;
      const p = __APP__.people.find(p => cnt[p.name] === 1 && !onSlate.has(p.id) && p.id !== inc);
      return { name: p.name, id: p.id };
    });
    const sheet = 'Role,Person,Ranking,Readiness\n' +
      `Chief Executive Officer,${pick.name},1,Ready Now\n` +
      `Ghost Role,${pick.name},1,\n` +
      'Chief Executive Officer,Nobody Realman,2,';
    await page.evaluate(t => __APP__.startSheetImport([{ name: 'slate.csv', text: t }]), sheet);
    const rv = await page.evaluate(() => ({ stats: __APP__.importReview.stats, csv: __APP__.buildImportReportCsv(__APP__.importReview.report) }));
    assertEq(rv.stats.slateAdded, 1, 'one valid row staged');
    assertEq(rv.stats.errors, 2, 'two dangling refs are errors');
    assert(rv.csv.includes('Ghost Role') && rv.csv.includes('Nobody Realman') && rv.csv.includes('ERROR'), 'error report names the bad rows');
    await page.click('#drawerSave');
    const ok = await page.evaluate(pid => __APP__.successors.some(s => s.roleId === 'R-CEO' && s.personId === pid), pick.id);
    assert(ok, 'resolved-by-name row applied; bad rows skipped');
  });
  await test('roles sheet: manager by title, incumbent by name, board tab auto-created', async () => {
    await loadBase(page);
    const pickName = await page.evaluate(() => { const cnt = {}; __APP__.people.forEach(p => cnt[p.name] = (cnt[p.name] || 0) + 1); return __APP__.people.find(p => cnt[p.name] === 1).name; });
    const sheet = 'Role ID,Role Title,Level,Department,Manager Role,Incumbent,Board\n' +
      `,Deputy CFO,VP,Finance,Chief Financial Officer,${pickName},Growth Board`;
    await page.evaluate(t => __APP__.startSheetImport([{ name: 'roles.csv', text: t }]), sheet);
    assertEq(await page.evaluate(() => __APP__.importReview.stats.rolesAdded), 1);
    await page.click('#drawerSave');
    const r = await page.evaluate(() => __APP__.roles.find(x => x.title === 'Deputy CFO'));
    assertEq(r.managerRoleId, 'R-CFO', 'manager resolved by title');
    assert(r.incumbentPersonId, 'incumbent resolved by name');
    const b = await page.evaluate(() => __APP__.boards.find(x => x.name === 'Growth Board'));
    assert(b, 'board tab created');
    assertEq(r.boardId, b.id, 'role assigned to the new tab');
  });
  await test('cancelling an import leaves the database byte-identical', async () => {
    await loadBase(page);
    const before = await csvOf(page);
    await page.evaluate(() => __APP__.startSheetImport([{ name: 'p.csv', text: 'Person ID,Name,Readiness\n,Cancel Me,Ready Now' }]));
    await page.click('[data-action="importCancel"]');
    assertEq(await csvOf(page), before, 'nothing changed');
    assert(await page.evaluate(() => !__APP__.importReview), 'review cleared');
  });
  await test('dropping roles + slate sheets together works regardless of drop order', async () => {
    await loadBase(page);
    const pickName = await page.evaluate(() => { const cnt = {}; __APP__.people.forEach(p => cnt[p.name] = (cnt[p.name] || 0) + 1); return __APP__.people.find(p => cnt[p.name] === 1).name; });
    await page.evaluate(([roleSheet, slateSheet]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([slateSheet], 'slate.csv', { type: 'text/csv' })); // slate FIRST on purpose
      dt.items.add(new File([roleSheet], 'roles.csv', { type: 'text/csv' }));
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, ['Role ID,Role Title,Level,Department\nR-ZIP,Zip Role,VP,Ops', `Role,Person,Ranking\nZip Role,${pickName},1`]);
    await page.waitForFunction(() => !!__APP__.importReview);
    const rv = await page.evaluate(() => __APP__.importReview.stats);
    assertEq(rv.rolesAdded, 1, 'role staged');
    assertEq(rv.slateAdded, 1, 'slate row resolved against the new role (roles processed first)');
    assertEq(rv.errors, 0, 'no errors');
    await page.click('[data-action="importCancel"]');
  });

  /* ===================================================================
     16. EXCEL (.xlsx) & SHARE / MERGE-BACK
     =================================================================== */
  section('16. Excel & share/merge-back');
  await test('chess footer: jump-to-role dropdown and prev/next switch boards', async () => {
    await loadBase(page);
    await page.evaluate(() => __APP__.openChessView('R-CEO'));
    assert(await page.locator('#chessRoleSwitch').count() === 1, 'switcher rendered');
    await setSelect(page, 'chessRoleSwitch', 'R-CFO');
    assertEq(await page.evaluate(() => __APP__.chess.roleId), 'R-CFO', 'dropdown switches the board');
    await page.click('[data-action="chessNav"][data-delta="1"]');
    const after = await page.evaluate(() => __APP__.chess.roleId);
    assert(after && after !== 'R-CFO', 'next arrow moves to another role');
    // staged move + switch asks to discard
    const order = await page.evaluate(() => [...__APP__.chess.order]);
    if (order.length >= 2) {
      await simulateDrag(page, `#chessOverlay .square[data-succ-id="${order[0]}"]`, `#chessOverlay .square[data-succ-id="${order[1]}"]`);
      dialogs = [];
      await setSelect(page, 'chessRoleSwitch', 'R-CEO');
      assert(dialogs.length === 1 && dialogs[0].message.includes('Discard'), 'discard confirm on switch');
      assertEq(await page.evaluate(() => __APP__.chess.roleId), 'R-CEO', 'switched after confirm');
    }
    await page.evaluate(() => __APP__.closeChessView(true));
  });
  await test('Excel workbook export → import round-trips the whole database', async () => {
    await loadBase(page);
    const before = await csvOf(page);
    const res = await page.evaluate(async () => {
      const bytes = __APP__.buildWorkbookBytes();
      const sheets = await __APP__.readXlsx(bytes);
      await __APP__.importXlsxBuffer(bytes, 'roundtrip.xlsx');
      return { names: sheets.map(s => s.name), stats: __APP__.importReview.stats, size: bytes.length };
    });
    ['People', 'Roles', 'Candidates', 'Boards'].forEach(n => assert(res.names.includes(n), 'workbook has tab ' + n));
    assertEq(res.stats.errors, 0, 'no errors');
    assertEq(res.stats.peopleAdded, 0, 'nothing spuriously new');
    assertEq(res.stats.peopleUpdated, 150, 'all people matched');
    assertEq(res.stats.rolesUpdated, 72, 'all roles matched');
    assert(res.stats.slateUpdated >= 280, 'all slate rows matched');
    await page.click('#drawerSave'); // Apply Import
    const strip = t => t.split('\n').filter(l => !l.startsWith('HISTORY')).join('\n');
    assertEq(strip(await csvOf(page)), strip(before), 'database identical after Excel round trip');
  });
  await test('reads real-world xlsx: DEFLATE compression + sharedStrings', async () => {
    const zlib = require('zlib');
    const num = (n, b) => { const buf = Buffer.alloc(b); buf.writeUIntLE(n >>> 0, 0, b); return buf; };
    const nodeZip = entries => {
      const chunks = []; const central = []; let offset = 0;
      for (const e of entries) {
        const name = Buffer.from(e.name); const comp = zlib.deflateRawSync(e.data); const crc = zlib.crc32(e.data) >>> 0;
        chunks.push(num(0x04034b50, 4), num(20, 2), num(0, 2), num(8, 2), num(0, 2), num(0, 2), num(crc, 4), num(comp.length, 4), num(e.data.length, 4), num(name.length, 2), num(0, 2), name, comp);
        central.push({ name, crc, csize: comp.length, usize: e.data.length, offset });
        offset += 30 + name.length + comp.length;
      }
      const cdStart = offset; let cdSize = 0;
      for (const e of central) {
        chunks.push(num(0x02014b50, 4), num(20, 2), num(20, 2), num(0, 2), num(8, 2), num(0, 2), num(0, 2), num(e.crc, 4), num(e.csize, 4), num(e.usize, 4), num(e.name.length, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 4), num(e.offset, 4), e.name);
        cdSize += 46 + e.name.length;
      }
      chunks.push(num(0x06054b50, 4), num(0, 2), num(0, 2), num(central.length, 2), num(central.length, 2), num(cdSize, 4), num(cdStart, 4), num(0, 2));
      return Buffer.concat(chunks);
    };
    const buf = nodeZip([
      { name: 'xl/workbook.xml', data: Buffer.from('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="People" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
      { name: 'xl/sharedStrings.xml', data: Buffer.from('<?xml version="1.0"?><sst><si><t>Person ID</t></si><si><t>Name</t></si><si><t>Readiness</t></si><si><t>P-XL1</t></si><si><t>Excel Deflate Person</t></si><si><t>Ready Now</t></si></sst>') },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.from('<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row></sheetData></worksheet>') },
    ]);
    await loadBase(page);
    const rows = await page.evaluate(async b64 => {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const sheets = await __APP__.readXlsx(u8);
      await __APP__.importXlsxBuffer(u8, 'excel_native.xlsx');
      return sheets[0].rows;
    }, buf.toString('base64'));
    assertEq(rows[1].join('|'), 'P-XL1|Excel Deflate Person|Ready Now', 'deflate + sharedStrings decoded');
    await page.click('#drawerSave');
    assert(await page.evaluate(() => __APP__.people.some(p => p.id === 'P-XL1')), 'person from Excel-native file imported');
  });
  await test('share one board: scoped export contains only that board and its people', async () => {
    await loadBase(page);
    const scoped = await page.evaluate(() => { const d = __APP__.buildScopedData('BOARD-PROD'); return { csv: __APP__.toCSV(d), roles: d.roles.length, people: d.people.length, total: __APP__.roles.length }; });
    assert(scoped.roles > 0 && scoped.roles < scoped.total, 'subset is a strict slice');
    await page.evaluate(t => __APP__.loadCSV(t), scoped.csv); // recipient opens it
    const rec = await counts(page);
    assertEq(rec.roles, scoped.roles, 'recipient sees only the shared board roles');
    assertEq(rec.people, scoped.people, 'and only the referenced people');
    assertEq(await page.evaluate(() => __APP__.boards.filter(b => !['MASTER', 'ALL', 'PEOPLE', 'INSIGHTS', 'RULES', 'HISTORY'].includes(b.id)).length), 1, 'one board tab');
  });
  await test('merge-back calculates updates and unique additions from the returned file', async () => {
    await loadBase(page);
    const scopedCsv = await page.evaluate(() => __APP__.toCSV(__APP__.buildScopedData('BOARD-PROD')));
    // recipient session: edit one person, add a new one
    await page.evaluate(t => __APP__.loadCSV(t), scopedCsv);
    const edit = await page.evaluate(() => {
      const p = __APP__.people[0]; p.readiness = 'Interim Ready';
      __APP__.people.push({ id: 'P-RETURN', name: 'Returned Person', title: 'New Analyst', department: 'Product', email: '', location: '', jobLevel: '', performance: '', potential: '', retentionRisk: '', mobility: '', criticalExperience: '', skills: '', readiness: 'Ready Now', source: 'Internal', candidateType: 'Successor', confidence: 'High', notes: '' });
      return { pid: p.id, csv: __APP__.toCSV() };
    });
    await loadBase(page); // back in the master database
    await page.evaluate(([n, t]) => __APP__.importFullDbText(n, t), ['returned_board.csv', edit.csv]);
    const st = await page.evaluate(() => __APP__.importReview.stats);
    assertEq(st.errors, 0, 'clean merge');
    assertEq(st.peopleAdded, 1, 'unique new person detected');
    await page.click('#drawerSave');
    const after = await page.evaluate(pid => ({
      readiness: __APP__.people.find(p => p.id === pid).readiness,
      returned: !!__APP__.people.find(p => p.id === 'P-RETURN'),
      roles: __APP__.roles.length, people: __APP__.people.length,
    }), edit.pid);
    assertEq(after.readiness, 'Interim Ready', 'edited value merged onto the master');
    assert(after.returned, 'new person added');
    assertEq(after.roles, 72, 'untouched master roles intact');
    assertEq(after.people, 151, 'exactly one person added');
  });
  await test('rule changes in a returned full export merge back too', async () => {
    await loadBase(page);
    const returned = await page.evaluate(() => { const r = __APP__.rules.find(x => x.id === 'RULE-001'); r.enabled = false; const t = __APP__.toCSV(); r.enabled = true; return t; });
    await page.evaluate(([n, t]) => __APP__.importFullDbText(n, t), ['returned_full.csv', returned]);
    const st = await page.evaluate(() => __APP__.importReview.stats);
    assert(st.other >= 1, 'rule update counted under Other updates');
    await page.click('#drawerSave');
    assertEq(await page.evaluate(() => __APP__.rules.find(r => r.id === 'RULE-001').enabled), false, 'rule state merged');
  });

  /* ===================================================================
     17. SCREENSHOTS for the report
     =================================================================== */
  section('13. Screenshots');
  await test('capture UI screenshots', async () => {
    await page.setViewportSize({ width: 1560, height: 980 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => __APP__.forgetStoredFile());
    await loadBase(page);
    const tidy = () => page.evaluate(() => {
      document.getElementById('toasts').innerHTML = '';
      document.getElementById('banner').innerHTML = '';
      document.getElementById('dbStatus').textContent = 'succession_data.csv';
    });
    await page.evaluate(() => { __APP__.activeTab = 'ALL'; __APP__.render(); });
    await tidy();
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screen_board.png') });
    await page.evaluate(() => { __APP__.activeTab = 'INSIGHTS'; __APP__.render(); });
    await tidy();
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screen_insights.png') });
    await page.evaluate(() => { __APP__.activeTab = 'MASTER'; __APP__.render(); });
    await tidy();
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screen_tree.png') });
    await page.evaluate(() => { __APP__.activeTab = 'RULES'; __APP__.render(); });
    await tidy();
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screen_rules.png') });
    await page.evaluate(() => __APP__.openRoleDrawer('R-CEO'));
    await page.waitForTimeout(300);
    await tidy();
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screen_drawer.png') });
    await page.evaluate(() => __APP__.closeDrawer());
    await page.evaluate(() => __APP__.openChessView('R-COO'));
    await tidy();
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screen_chess.png') });
    await page.evaluate(() => __APP__.closeChessView(true));
  });

  /* ===================================================================
     FINISH
     =================================================================== */
  await test('zero console errors across the whole run', async () => {
    assert(consoleErrors.length === 0, 'console errors: ' + consoleErrors.slice(0, 5).join(' | '));
  });

  await browser.close();
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\n============================================');
  console.log(`TOTAL: ${results.length}  PASS: ${pass}  FAIL: ${fail}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (fail) { console.log('\nFailures:'); results.filter(r => !r.ok).forEach(r => console.log('  ✗ ' + r.name + ' — ' + r.err)); process.exit(1); }
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });

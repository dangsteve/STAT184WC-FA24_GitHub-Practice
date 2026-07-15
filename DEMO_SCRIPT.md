# 5-Minute Manager Demo — Succession Planner

Open `succession_planner.html` → **Open CSV** → pick **`succession_demo.csv`**.
Small on purpose: 8 people, 5 roles, 2 board tabs, 1 rule — but every feature
has something to show.

**1. Org Tree (opens first).**
A small family tree: CEO on top, CFO and CRO below, Sales under the CRO. The
*Sales Director* hangs on a **dashed** line — that role has no manager set in
the CSV, so the app placed it by level (Director under VP) on its own. Click
**Apply inferred lines** to make it permanent.

**2. Executive Team tab — the working board.**
Three cards. Points to hit:
- **Chief Revenue Officer is VACANT** (red badge) with Riley Chen standing by —
  press **Approve Top** and the seat fills instantly.
- On the **CEO** card, approve **Taylor Brooks** (#1, Ready Now) — clean move,
  Alex Rivera steps down, history logs it.
- Now try approving **Jordan Kim** (#2, "1-2 Years") — the rule stops it with a
  red message. That's governance built in.
- **Undo** (or Ctrl+Z) walks all of this back live.

**3. ♞ Board — the chess view (the wow moment).**
Open it on the **CFO** card:
- King on the throne = current incumbent. Queen = 1st in line, then Rook, etc.
- Drag one piece onto another — the two people **swap** places.
- Drag a piece onto the **throne** — staged to take the seat, with callouts
  (external candidate warning, who steps down, what goes vacant).
- Pull someone new from the **Piece Bank** on the right onto any square.
- Note the **Unsaved moves** chip: nothing is real until **Save**; **Close**
  throws it all away. Try **Fields shown** to change what every piece displays.

**4. Sales tab.**
The *Sales Director* card has **no candidates** — drag Jamie or anyone from the
Candidate Box onto it live. Approving Jamie Patel into **VP Sales** shows the
cascade: their Director role goes vacant and gets flagged.

**5. Insights tab.**
Coverage %, Ready-Now coverage, the vacant role, and "roles with no candidates"
(Sales Director) — the talking points for any talent review, computed live.

**6. Rules tab.**
One rule, in plain English, with an on/off switch. Flip it off and Jordan Kim's
blocked move from step 2 now goes through with a warning instead.

**7. Save.**
Press **Save** — everything writes back into the same CSV. Reopen the file:
the demo picks up exactly where it left off. One HTML file + one CSV, no
install, no server.

*(For the full-size stress dataset, open `succession_data.csv` instead.)*

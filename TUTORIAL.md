# Gantt Planner — Tutorial & Concepts Guide

This guide walks you through every major feature of the tool and the project-
management theory behind it: **Gantt charts, the Critical Path Method, slack,
schedule crashing, resource allocation, and cost-vs-time optimization.**

It's built around three ready-made example projects. Open the app, click
**Projects** in the toolbar, and under **"Load an example"** load all three:

| Example | Teaches |
|---------|---------|
| **1 — Mobile App v1.0** | Critical path, slack, and crashing |
| **2 — Office Relocation** | Dependency types, lag, and resource conflicts |
| **3 — Conference 2026** | Cost-vs-time optimization |

Each loads as its own project (your other projects are never touched). Switch
between projects with the dropdown at the top-left.

> Every number in this guide is reproducible: load the example and you'll see
> exactly these values.

---

## 1. The interface at a glance

- **Toolbar** — project switcher · **Projects** · **+ Task** · **Resources** ·
  **What-if** · **Settings** · **Import/Export** · **Reset**.
- **Status bar** — live project finish date, duration in working days, task count
  (and how many are critical), total cost, and resource alerts.
- **Gantt chart** — task names on the left; bars on a working-day timeline.
  - **Red bars** = tasks on the *critical path*.
  - **Blue bars** = tasks with *slack* (schedule float).
  - **Dotted tail** after a bar = how much slack that task has.
  - **Arrows** = dependencies (dashed arrows are non-default dependency types).
  - **Green line** = today. **Purple dashed line** = a deadline you're analyzing.
- **Click any bar** (or its name) to edit the task. **Drag a bar** to reschedule;
  **drag its right edge** to change duration (more on this below).

---

## 2. Tasks and durations

Click **+ Task**, or click an existing bar to open the editor. A task has a name,
description, a driving **resource**, and a **scheduling mode**:

### Effort-driven (the default)
You enter **work** in *person-days* and the number of **units** (people)
assigned. The tool computes the calendar duration:

```
duration (working days) = ceil( work ÷ units )
```

Example: "Backend services" is **24 person-days** of work with **2 engineers** →
`ceil(24 / 2) = 12` working days. Assign a 3rd engineer and it drops to
`ceil(24 / 3) = 8` days. **This is what makes resources and schedule interact** —
and what powers the what-if analysis.

### Fixed duration
Switch the mode to **Fixed duration** when a task takes a set amount of calendar
time regardless of headcount (e.g. "furniture delivery lead time"). Adding people
won't shorten it.

### Duration by dragging
Drag a bar's **right edge** to lengthen/shorten it directly. For effort-driven
tasks the tool back-solves the work; for fixed tasks it sets the duration.

---

## 3. Dependencies, types, and lag

In the task editor, under **Dependencies (predecessors)**, pick a predecessor, a
**type**, and an optional **lag** (in working days). Cycles are rejected
automatically.

The four dependency types (predecessor **P** → successor **S**):

| Type | Meaning | Rule |
|------|---------|------|
| **FS** Finish→Start | S starts after P finishes (the usual case) | `S.start ≥ P.finish + lag` |
| **SS** Start→Start | S starts once P has started | `S.start ≥ P.start + lag` |
| **FF** Finish→Finish | S can't finish until P finishes | `S.finish ≥ P.finish + lag` |
| **SF** Start→Finish | rare; S can't finish until P starts | `S.finish ≥ P.start + lag` |

**Lag** adds waiting time. **Example 2 — Office Relocation** uses both:
- *Vendor negotiations → Furniture delivery* is **FS + 8** — an 8-working-day
  delivery lead time after ordering. You'll see the arrow jump a gap.
- *IT infrastructure → Workstation setup* is **SS + 2** — setup can start 2 days
  after IT work begins, running in parallel rather than waiting for it to finish.

Dashed arrows in the chart mark these non-FS links.

---

## 4. The Critical Path Method (CPM)

Switch to **Example 1 — Mobile App v1.0**. The status bar reads **Finish Sep 15
(32 working days), 7 tasks (6 critical)**.

CPM finds, for every task, four numbers by making two passes over the dependency
network:

- **Forward pass** → **Early Start (ES)** and **Early Finish (EF)**: the soonest a
  task *can* start/finish given its predecessors.
- **Backward pass** → **Late Start (LS)** and **Late Finish (LF)**: the latest it
  *can* start/finish without delaying the whole project.

From these:

```
slack (float) = LS − ES = LF − EF
```

- **Slack = 0** → the task is on the **critical path**. Delay it by a day and the
  whole project slips by a day. These are drawn **red**.
- **Slack > 0** → the task has room to move. Drawn **blue**, with a dotted tail
  showing how much float it has.

The **critical path** is the longest chain of dependent tasks through the project.
It sets the project's duration; nothing finishes sooner unless the critical path
gets shorter.

### See it in Example 1

Hover the bars (the tooltip shows slack). You'll find:

```
Requirements → UX design → iOS app → Integration → QA → Launch     (all CRITICAL, red)
                        └→ Android app ┘                            (also critical)
Backend services ................................ slack = 3 days    (blue, dotted tail)
```

**Backend services** has **3 days of slack**: it needs 12 days and can finish any
time before Integration needs it, so it isn't driving the finish date — *yet*.
iOS and Android are **both** critical (they finish at the same time and
Integration waits for the later of the two).

> **Key insight:** to make a project finish sooner, you must shorten the
> **critical path**. Speeding up a task with slack (like Backend) changes nothing
> until its slack runs out.

---

## 5. Resources, capacity, and over-allocation

Open **Resources**. Each resource (a role) has:

- **Cost / day** — the fully-loaded daily cost of *one unit* (one person).
- **Capacity** — how many units are available to work at the same time.

The panel shows each resource's **peak demand vs capacity** and flags any
**over-allocation** — days when more units are demanded than exist.

### See it in Example 2 — Office Relocation

The status bar warns **"2 over-allocated"**. Open **Resources**:

- **Facilities Lead** — capacity **1**, but *peak demand 2* for **6 days**.
  Why? *Floor plan design* and *Vendor negotiations* both depend only on the lease
  and both need the (single) Facilities Lead, so they overlap. One person can't do
  both at once.
- **IT Tech** — capacity **2**, peak **4** for 4 days, caused by the SS overlap
  between *IT infrastructure* and *Workstation setup*.

**How to fix an over-allocation — two levers:**

1. **Add capacity** (hire/contract): open Resources, raise Facilities Lead
   capacity to **2**. The alert clears — you've paid for a second person.
2. **Re-sequence** (no extra cost): open *Vendor negotiations*, add *Floor plan
   design* as an **FS predecessor** so they run back-to-back instead of at once.
   The conflict disappears, but the project may take longer.

This is the classic trade-off: **resolve conflicts with money (more capacity) or
with time (serialize the work).** The tool lets you try both and see the effect on
the finish date and cost immediately.

---

## 6. Modeling adding or removing resources

Because duration = `ceil(work ÷ units)`, changing units directly reshapes the
schedule. Try these in **Example 1**:

- **Remove a resource:** open *Backend services*, set **units 2 → 1**. Duration
  jumps 12 → 24 days, Backend's slack vanishes, it becomes critical, and the
  project finish slips from **32 → 41 working days**. Fewer people, later finish.
- **Add a resource:** set it back to 2, then try 3 → duration `ceil(24/3) = 8`.
  (Backend had 3 days of slack, so this particular change doesn't pull the finish
  date in — it just widens Backend's float. Speeding up a *critical* task is what
  moves the date.)

Watch the **status bar** finish date and total cost update on every change. This
manual experimentation is the "what-if" done by hand; Section 8 automates it.

---

## 7. The cost model

Open **Settings**. Three inputs drive cost:

- **Resource cost/day** (per unit) — set in the Resources panel.
- **Indirect cost / day (overhead)** — rent, management, tooling: costs you pay
  for every day the project runs, regardless of who's working.
- **Coordination overhead %** — the extra cost each *additional* unit adds to a
  task, modeling communication overhead and diminishing returns (Brooks's Law:
  "adding people to a late project makes it later"). Default **20%**.

The tool computes:

```
task labour cost = units × duration × rate × (1 + overhead% × (units − 1))
direct cost      = Σ task labour costs
indirect cost    = indirect/day × project duration
TOTAL COST       = direct + indirect
```

**Why the coordination overhead matters:** without it, adding people would keep
total person-days constant, so speeding up would always be free or even cheaper.
With it, piling extra people onto a task genuinely costs more — which is exactly
why **crashing a schedule costs money**, and why there's an optimal balance
between cost and speed.

Example 1's baseline total is **$146,150** ($82,150 direct + $64,000 indirect).

---

## 8. What-if #1 — Crashing to hit a deadline

**Crashing** = deliberately shortening the critical path by adding resources to
critical tasks, spending as little extra as possible per day saved.

Open **What-if** on **Example 1**. The top shows the current finish (Sep 15) and
cost. Under **① Hit a deadline**, set a target finish of **2026-09-07** (about a
week early) and click **Analyze deadline**.

The tool runs a greedy algorithm: each round it looks at the current critical
path, finds the critical task with the **cheapest cost per day saved**, adds one
unit there, reschedules, and repeats until the deadline is met. Result:

```
✔ Deadline achievable — pulls finish in to Sep 4 (7 working days earlier).

Extra resources required:   Engineer +5 units,  QA +1 unit
Direct cost:   +$15,880
Indirect cost:  −$14,000   (14 fewer days of overhead)
TOTAL cost:      +$1,880
```

Read the **crash steps** table (cheapest first):

```
QA & bug-fix   2→3   saves 2d  @ $660/day
Backend        2→3   saves 4d  @ $840/day    ← Backend gets crashed too!
iOS app        3→4   saves 2d  @ $910/day
Android app    3→4   saves 2d  @ $910/day
iOS app        2→3   saves 3d  @ $1,260/day
Android app    2→3   saves 3d  @ $1,260/day
```

Two things to notice:

1. **Backend services gets crashed** even though it started with 3 days of slack.
   As you compress the main path, Backend *becomes* critical, so it has to be
   sped up too. The critical path is not fixed — it shifts as you crash.
2. **Cost per day saved rises** as you go (diminishing returns from the
   coordination overhead). The cheap wins get taken first.

Click **Apply this plan to the project** to commit the extra resources, or close
the dialog to leave the plan untouched.

> If a deadline is impossible even fully crashed, the tool says so and shows the
> earliest finish physically achievable. (Crashing can also *overshoot* — here we
> asked for Sep 7 and got Sep 4, because the final step saved several days at once.)

---

## 9. What-if #2 — Cost vs. speed of delivery

Faster usually means more resources (higher direct cost) but fewer days of
overhead (lower indirect cost). Somewhere between "as slow as the plan allows" and
"as fast as physically possible" sits the **cheapest** way to deliver. That's what
this analysis finds.

Switch to **Example 3 — Conference 2026** (baseline: **30 working days,
$81,480**). Open **What-if → ② Cost vs. speed** and click **Compute curve**.

The tool computes, for *every* achievable finish date, the minimum-cost plan that
hits it, and plots three lines — **direct** (rising as you crash), **indirect**
(falling as you shorten), and **total** — marking the cheapest point:

```
duration   total      = direct   + indirect
  24 days  $82,160     $60,560     $21,600     ← fastest possible
  25 days  $81,560     $59,060     $22,500
  26 days  $81,560     $59,060     $22,500
  27 days  $80,660     $56,360     $24,300     ← CHEAPEST  ✅
  28 days  $81,480     $56,280     $25,200
  29 days  $81,180     $55,080     $26,100
  30 days  $81,480     $54,480     $27,000     ← normal plan (no crashing)
```

The **total-cost curve is U-shaped**:

- Going from 30 → 27 days, each day cut saves more overhead than the extra
  resources cost. **Total cost falls.** Worth doing.
- Past 27 days, the coordination overhead of piling on more people outweighs the
  overhead saved. **Total cost rises again.**
- **27 days is the economic optimum: $80,660** — $820 cheaper than the normal
  plan *and* three days faster, and $1,500 cheaper than rushing all the way to 24
  days.

> **The lesson:** the fastest schedule is rarely the cheapest, and the "default"
> schedule usually isn't either. The optimum is an interior point you have to
> compute — which is the whole reason this analysis exists.

To *act* on it: note the optimum duration, then use **① Hit a deadline** with that
date (here ~27 days out) and **Apply the plan**.

---

## 10. Putting it together — a suggested workflow

1. **Model the work.** Add tasks with realistic *work* estimates and wire up
   dependencies (Sections 2–3).
2. **Assign resources** and set their capacity and cost (Section 5).
3. **Read the critical path.** It tells you which tasks actually control your
   finish date — focus management attention there (Section 4).
4. **Clear over-allocations** by adding capacity or re-sequencing (Section 5).
5. **Set your cost inputs** — overhead and coordination % (Section 7).
6. **Ask the two what-if questions** (Sections 8–9):
   - *"Can we hit date X, and what does it cost?"* → deadline crashing.
   - *"What's the cheapest way to deliver?"* → cost-vs-speed curve.
7. **Save & share.** Everything auto-saves in your browser. Use **Export** to send
   a project as a file; the other person uses **Import** to open it as a new
   project. Keep exports as backups.

---

## Glossary

- **Working day** — a scheduled day; weekends (configurable in Settings) are
  skipped everywhere.
- **ES / EF / LS / LF** — early/late start/finish (Section 4).
- **Slack (float)** — how long a task can slip without delaying the project.
- **Critical path** — the zero-slack chain that determines the project duration.
- **Crashing** — shortening the schedule by adding resources to critical tasks.
- **Direct cost** — labour: people × time × rate (× coordination overhead).
- **Indirect cost** — daily overhead paid for the project's whole duration.
- **Coordination overhead** — the rising cost of adding more people to one task.
- **Start constraint** — a "start no earlier than" date set by dragging a bar
  (shown with a 📌); clear it in the task editor.

# Gantt Planner

A project-management app centered on the **Gantt chart**, with resource
allocation, cost tracking, and what-if analysis. Pure HTML/CSS/vanilla JS —
**no build step, no dependencies**.

## Run it

Just open `index.html` in a browser (double-click it), or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Your projects auto-save to the browser's `localStorage`. Use the **project
switcher** (top-left) and **Projects** button to keep many projects, and
**Export / Import** to move a single project as a JSON file.

**New here?** Read the **[TUTORIAL.md](TUTORIAL.md)** — a full walkthrough of
every feature (critical path, crashing, resource modeling, cost-vs-time
optimization) built around three loadable example projects. In the app, click
**Projects → Load an example** to follow along. The examples also live as shareable
JSON in [`examples/`](examples/).

**Hosting / sharing:** see [DEPLOY.md](DEPLOY.md) for one-click GitHub Pages
deployment. Each visitor keeps their own projects in their own browser; share a
plan by exporting a `.json` and having the other person import it.

## Features

### Planning
- **Multiple projects** — switch between them in the toolbar; create, rename,
  duplicate, and delete via the **Projects** panel. Each is stored separately.
- **Tasks** with name, description, work/duration, assigned resource + units, progress.
- **Drag to reschedule** — drag a bar sideways to set a start constraint (cascades
  to dependents), or drag its right edge to change duration.
- **Dependencies** of all four types — Finish→Start, Start→Start, Finish→Finish,
  Start→Finish — each with an optional lag (in working days). Cycles are rejected.
- **Working-day calendar** — weekends (configurable) are skipped in all scheduling.

### Scheduling (Critical Path Method)
- Forward/backward pass computes early/late start & finish, **slack**, and the
  **critical path** (highlighted red). Slack is drawn as a dotted tail on each bar.
- Live status bar: finish date, duration, task/critical counts, total cost, and
  resource-allocation alerts.

### Resources & cost
- **Resources** are roles with a daily cost and a capacity (units available at once).
- **Time-phased over-allocation detection** flags any resource whose day-by-day
  demand exceeds its capacity.
- **Cost model**: direct cost (units × days × rate, per task) + indirect/overhead
  cost per day.

### What-if analysis
1. **Hit a deadline** — pick a target date; the app *crashes* the schedule by
   adding resource units to critical tasks (cheapest cost-per-day-saved first),
   then reports the new finish, exactly which extra resources are needed, and the
   direct/indirect/total cost deltas. Apply the plan with one click.
2. **Cost vs. speed** — plots the time/cost tradeoff curve across every achievable
   finish date and marks the **minimum-total-cost** point (where falling overhead
   stops outweighing the rising cost of extra resources).

## How scheduling works

Tasks are **effort-driven** by default: `duration = ceil(work ÷ units)`. Assigning
more units shortens a task (down to its crash limit = max units or resource
capacity), which is what makes the what-if crashing meaningful. Switch a task to
**fixed duration** in its editor if you don't want it to flex.

## Project structure

| File | Responsibility |
|------|----------------|
| `js/calendar.js` | Working-day ↔ date math |
| `js/scheduler.js` | CPM forward/backward pass, dependency types, slack |
| `js/whatif.js` | Costing, over-allocation, deadline crashing, cost/speed curve |
| `js/store.js` | Data model, localStorage persistence, sample project |
| `js/gantt.js` | Chart rendering (bars, arrows, markers) |
| `js/ui.js` | Task/resource/settings editors, what-if panel |
| `js/main.js` | State, rescheduling, toolbar wiring |

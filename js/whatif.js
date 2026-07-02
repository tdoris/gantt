/*
 * whatif.js — resource costing, over-allocation detection, and what-if analysis.
 *
 * Two flagship analyses:
 *   1. crashToDeadline(): greedily add resource units to critical tasks to pull
 *      the finish date in to a target deadline (classic CPM "crashing"), and
 *      report exactly what extra resources / cost that takes.
 *   2. costSpeedCurve(): sweep achievable finish dates and, for each, compute
 *      the minimum-cost plan — the time/cost tradeoff curve.
 */
(function (GA) {
  'use strict';

  // ---- Costing ------------------------------------------------------------

  // Direct cost of a single task = for each assignment, units * duration(days)
  // * resource.costPerDay. The driving assignment's units also set duration.
  function taskDirectCost(task, sched, resourcesById) {
    var r = sched.tasks[task.id];
    var dur = r ? r.duration : GA.scheduler.computeDuration(task);
    var cost = 0;
    // Driving resource.
    var driver = resourcesById[task.resourceId];
    if (driver) cost += (task.units || 1) * dur * driver.costPerDay;
    // Extra ("along for the ride") assignments.
    (task.assignments || []).forEach(function (a) {
      var res = resourcesById[a.resourceId];
      if (res) cost += (a.units || 1) * dur * res.costPerDay;
    });
    return cost;
  }

  function summarizeCost(project, sched) {
    var resById = index(project.resources);
    var direct = 0;
    project.tasks.forEach(function (t) {
      direct += taskDirectCost(t, sched, resById);
    });
    var durationDays = sched.projectFinish;
    var indirect = (project.indirectPerDay || 0) * durationDays;
    return {
      direct: direct,
      indirect: indirect,
      total: direct + indirect,
      durationDays: durationDays,
    };
  }

  // ---- Resource over-allocation (time-phased) -----------------------------

  // For each resource, walk each working day and sum the units demanded by
  // tasks active that day. Flag days exceeding capacity.
  function overAllocations(project, sched) {
    var resById = index(project.resources);
    var demand = {}; // resourceId -> { dayIndex -> units }
    project.resources.forEach(function (res) { demand[res.id] = {}; });

    function add(resId, es, ef, units) {
      if (!demand[resId]) return;
      for (var d = es; d < ef; d++) {
        demand[resId][d] = (demand[resId][d] || 0) + units;
      }
    }

    project.tasks.forEach(function (t) {
      var r = sched.tasks[t.id];
      if (!r) return;
      if (t.resourceId) add(t.resourceId, r.es, r.ef, t.units || 1);
      (t.assignments || []).forEach(function (a) {
        add(a.resourceId, r.es, r.ef, a.units || 1);
      });
    });

    var conflicts = [];
    project.resources.forEach(function (res) {
      var cap = res.capacity || 1;
      var days = demand[res.id];
      var peak = 0;
      var conflictDays = 0;
      Object.keys(days).forEach(function (d) {
        if (days[d] > peak) peak = days[d];
        if (days[d] > cap) conflictDays++;
      });
      conflicts.push({
        resourceId: res.id,
        name: res.name,
        capacity: cap,
        peak: peak,
        conflictDays: conflictDays,
        overallocated: peak > cap,
        demand: days,
      });
    });
    return conflicts;
  }

  // ---- What-if: crash to a deadline --------------------------------------

  // Greedy CPM crashing. Each pass: schedule, find the critical path, and among
  // critical tasks that can still be sped up (units < maxUnits, capacity room),
  // pick the one with the cheapest marginal cost per working-day saved. Add a
  // unit there and repeat until the deadline is met or no task can be crashed.
  function crashToDeadline(project, calendar, deadlineDate) {
    var work = cloneProject(project);
    var resById = index(work.resources);
    var deadlineIdx = calendar.dateToIndex(GA.dateUtil.parseDate(deadlineDate));

    var baseSched = GA.scheduler.schedule(work, calendar);
    var baseCost = summarizeCost(work, baseSched);
    var baseFinish = baseSched.projectFinish;

    if (baseSched.cycle) {
      return { error: 'Cannot analyze: dependency cycle.', };
    }

    var steps = [];
    var guard = 0;
    var sched = baseSched;

    while (sched.projectFinish > deadlineIdx && guard++ < 1000) {
      // Candidate = critical task that can absorb one more unit.
      var best = null;
      work.tasks.forEach(function (t) {
        var r = sched.tasks[t.id];
        if (!r || !r.critical) return;
        var maxUnits = crashLimit(t, resById);
        if ((t.units || 1) >= maxUnits) return; // already at crash limit
        // Marginal effect: adding a unit shortens this task by:
        var curDur = r.duration;
        var newUnits = (t.units || 1) + 1;
        var newDur = t.work != null
          ? Math.max(1, Math.ceil(t.work / newUnits))
          : curDur; // fixed-duration tasks can't be crashed
        var saved = curDur - newDur;
        if (saved <= 0) return;
        var res = resById[t.resourceId];
        var marginalCost = res ? res.costPerDay * newDur : 0; // extra unit over new duration
        var costPerDaySaved = marginalCost / saved;
        if (!best || costPerDaySaved < best.costPerDaySaved) {
          best = {
            taskId: t.id, taskName: t.name, saved: saved,
            costPerDaySaved: costPerDaySaved, resourceId: t.resourceId,
            fromUnits: t.units || 1, toUnits: newUnits,
          };
        }
      });

      if (!best) break; // nothing left to crash — deadline infeasible

      // Apply the crash.
      var task = work.tasks.find(function (t) { return t.id === best.taskId; });
      task.units = best.toUnits;
      steps.push(best);
      sched = GA.scheduler.schedule(work, calendar);
    }

    var finalCost = summarizeCost(work, sched);

    // Aggregate added units per resource.
    var addedByResource = {};
    steps.forEach(function (s) {
      addedByResource[s.resourceId] = (addedByResource[s.resourceId] || 0) + 1;
    });
    var addedResources = Object.keys(addedByResource).map(function (rid) {
      var res = resById[rid];
      return { resourceId: rid, name: res ? res.name : rid, addedUnits: addedByResource[rid] };
    });

    return {
      deadlineIndex: deadlineIdx,
      deadlineDate: deadlineDate,
      achieved: sched.projectFinish <= deadlineIdx,
      baseFinishIndex: baseFinish,
      baseFinishDate: calendar.indexToDate(Math.max(0, baseFinish - 1)),
      newFinishIndex: sched.projectFinish,
      newFinishDate: calendar.indexToDate(Math.max(0, sched.projectFinish - 1)),
      daysSaved: baseFinish - sched.projectFinish,
      steps: steps,
      addedResources: addedResources,
      baseCost: baseCost,
      newCost: finalCost,
      costDelta: finalCost.total - baseCost.total,
      directDelta: finalCost.direct - baseCost.direct,
      indirectDelta: finalCost.indirect - baseCost.indirect,
      resultingProject: work, // caller may apply this plan
    };
  }

  // ---- What-if: cost vs speed curve --------------------------------------

  // Sweep from the fully-crashed finish up to the normal finish. For each target
  // finish, crash minimally to hit it and record total cost. Answers "how does
  // cost relate to speed of delivery?".
  function costSpeedCurve(project, calendar) {
    var base = GA.scheduler.schedule(project, calendar);
    var normalFinish = base.projectFinish;

    // Fully crash to find the shortest achievable finish.
    var maxCrashed = cloneProject(project);
    var resById = index(maxCrashed.resources);
    maxCrashed.tasks.forEach(function (t) {
      t.units = crashLimit(t, resById);
    });
    var crashedSched = GA.scheduler.schedule(maxCrashed, calendar);
    var minFinish = crashedSched.projectFinish;

    var points = [];
    for (var finish = normalFinish; finish >= minFinish; finish--) {
      var targetDate = calendar.indexToDate(Math.max(0, finish - 1));
      var res = crashToFinishIndex(project, calendar, finish);
      points.push({
        finishIndex: finish,
        finishDate: targetDate,
        durationDays: finish,
        total: res.total,
        direct: res.direct,
        indirect: res.indirect,
        achieved: res.achieved,
      });
    }
    points.reverse(); // ascending duration (fastest -> slowest)

    // Find the minimum-total-cost point (the economic optimum).
    var optimum = points.reduce(function (a, b) {
      return b.total < a.total ? b : a;
    }, points[0]);

    return { points: points, optimum: optimum, normalFinish: normalFinish, minFinish: minFinish };
  }

  // Helper: crash minimally to reach a target finish index; return its cost.
  function crashToFinishIndex(project, calendar, targetFinish) {
    var work = cloneProject(project);
    var resById = index(work.resources);
    var sched = GA.scheduler.schedule(work, calendar);
    var guard = 0;
    while (sched.projectFinish > targetFinish && guard++ < 1000) {
      var best = null;
      work.tasks.forEach(function (t) {
        var r = sched.tasks[t.id];
        if (!r || !r.critical) return;
        var maxUnits = crashLimit(t, resById);
        if ((t.units || 1) >= maxUnits) return;
        var newUnits = (t.units || 1) + 1;
        var newDur = t.work != null ? Math.max(1, Math.ceil(t.work / newUnits)) : r.duration;
        var saved = r.duration - newDur;
        if (saved <= 0) return;
        var res = resById[t.resourceId];
        var marginalCost = res ? res.costPerDay * newDur : 0;
        var cps = marginalCost / saved;
        if (!best || cps < best.cps) best = { id: t.id, toUnits: newUnits, cps: cps };
      });
      if (!best) break;
      var task = work.tasks.find(function (t) { return t.id === best.id; });
      task.units = best.toUnits;
      sched = GA.scheduler.schedule(work, calendar);
    }
    var cost = summarizeCost(work, sched);
    cost.achieved = sched.projectFinish <= targetFinish;
    return cost;
  }

  // ---- utilities ----------------------------------------------------------

  function crashLimit(task, resById) {
    // Max units we may assign: task.maxUnits if set, else the resource capacity,
    // but never more than the work (beyond that duration can't shrink).
    var res = resById[task.resourceId];
    var cap = res ? (res.capacity || 1) : 1;
    var lim = task.maxUnits != null ? task.maxUnits : cap;
    if (task.work != null) lim = Math.min(lim, task.work);
    return Math.max(task.units || 1, lim);
  }

  function index(arr) {
    var m = {};
    (arr || []).forEach(function (x) { m[x.id] = x; });
    return m;
  }

  function cloneProject(p) {
    return JSON.parse(JSON.stringify(p));
  }

  GA.whatif = {
    taskDirectCost: taskDirectCost,
    summarizeCost: summarizeCost,
    overAllocations: overAllocations,
    crashToDeadline: crashToDeadline,
    costSpeedCurve: costSpeedCurve,
    crashLimit: crashLimit,
  };
})(window.GA = window.GA || {});

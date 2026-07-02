/*
 * scheduler.js — Critical Path Method (CPM) scheduler.
 *
 * Works in integer working-day units. A task of duration d that starts at
 * early-start index ES occupies working days [ES, ES + d).
 *
 * Dependency types (predecessor P -> successor S), with integer `lag` in
 * working days:
 *   FS (finish-to-start): S.ES >= P.EF + lag
 *   SS (start-to-start):  S.ES >= P.ES + lag
 *   FF (finish-to-finish):S.EF >= P.EF + lag
 *   SF (start-to-finish): S.EF >= P.ES + lag
 *
 * Produces, per task: es, ef, ls, lf, slack, critical, plus start/end dates.
 * Also derives each task's calendar `duration` from its work + assigned units.
 */
(function (GA) {
  'use strict';

  var DEP_TYPES = ['FS', 'SS', 'FF', 'SF'];

  // Duration (working days) a task takes given effort in person-days and the
  // number of assigned units of its driving resource. Clamped to >= 1.
  function computeDuration(task) {
    var units = Math.max(1, task.units || 1);
    if (task.work != null) {
      return Math.max(1, Math.ceil(task.work / units));
    }
    return Math.max(1, task.duration || 1);
  }

  // Topological order of task ids honoring dependencies. Returns {order, cycle}.
  function topoSort(tasks, deps) {
    var incoming = {}; // taskId -> count of unmet predecessors
    var adj = {};      // predId -> [succId]
    tasks.forEach(function (t) { incoming[t.id] = 0; adj[t.id] = []; });
    deps.forEach(function (d) {
      if (incoming[d.to] == null || adj[d.from] == null) return;
      incoming[d.to]++;
      adj[d.from].push(d.to);
    });
    var queue = [];
    tasks.forEach(function (t) { if (incoming[t.id] === 0) queue.push(t.id); });
    var order = [];
    while (queue.length) {
      var id = queue.shift();
      order.push(id);
      adj[id].forEach(function (s) {
        if (--incoming[s] === 0) queue.push(s);
      });
    }
    var cycle = order.length !== tasks.length;
    return { order: order, cycle: cycle };
  }

  // Main entry. project: {tasks, dependencies}, calendar: GA.Calendar.
  // deadlineDate (optional) tightens the backward pass so slack is measured
  // against the target instead of the natural project finish.
  function schedule(project, calendar, deadlineDate) {
    var tasks = project.tasks;
    var deps = project.dependencies;
    var byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });

    var result = {}; // taskId -> computed fields
    tasks.forEach(function (t) {
      result[t.id] = {
        id: t.id,
        duration: computeDuration(t),
        es: 0, ef: 0, ls: 0, lf: 0, slack: 0, critical: false,
      };
    });

    var topo = topoSort(tasks, deps);
    if (topo.cycle) {
      return { error: 'Dependency cycle detected — cannot schedule.', tasks: result, cycle: true };
    }

    // Predecessors of each task, and successors, for the two passes.
    var preds = {}; // toId -> [{from, type, lag}]
    var succs = {}; // fromId -> [{to, type, lag}]
    tasks.forEach(function (t) { preds[t.id] = []; succs[t.id] = []; });
    deps.forEach(function (d) {
      if (!byId[d.from] || !byId[d.to]) return;
      var edge = { from: d.from, to: d.to, type: d.type || 'FS', lag: d.lag || 0 };
      preds[d.to].push(edge);
      succs[d.from].push(edge);
    });

    // ---- Forward pass: compute ES/EF in topological order ----
    topo.order.forEach(function (id) {
      var r = result[id];
      // A manual "start no earlier than" constraint (set by dragging a bar)
      // acts as a floor on the early start; dependencies can still push later.
      var es = byId[id].constraintStart || 0;
      preds[id].forEach(function (e) {
        var p = result[e.from];
        var candidate;
        switch (e.type) {
          case 'SS': candidate = p.es + e.lag; break;
          case 'FF': candidate = p.ef + e.lag - r.duration; break;
          case 'SF': candidate = p.es + e.lag - r.duration; break;
          case 'FS':
          default:   candidate = p.ef + e.lag; break;
        }
        if (candidate > es) es = candidate;
      });
      if (es < 0) es = 0;
      r.es = es;
      r.ef = es + r.duration;
    });

    // Natural project finish = latest EF.
    var projectFinish = 0;
    tasks.forEach(function (t) {
      if (result[t.id].ef > projectFinish) projectFinish = result[t.id].ef;
    });

    // The backward-pass horizon: the deadline if given (in working-day index),
    // otherwise the natural finish. If the deadline is *earlier* than the
    // natural finish, slack goes negative on the critical path -> infeasible.
    var horizon = projectFinish;
    if (deadlineDate) {
      var dIdx = calendar.dateToIndex(GA.dateUtil.parseDate(deadlineDate));
      horizon = dIdx;
    }

    // ---- Backward pass: compute LS/LF in reverse topological order ----
    var reverse = topo.order.slice().reverse();
    reverse.forEach(function (id) {
      var r = result[id];
      var lf;
      if (succs[id].length === 0) {
        lf = horizon;
      } else {
        lf = Infinity;
        succs[id].forEach(function (e) {
          var s = result[e.to];
          var candidate;
          switch (e.type) {
            case 'SS': candidate = s.ls - e.lag + r.duration; break;
            case 'FF': candidate = s.lf - e.lag; break;
            case 'SF': candidate = s.lf - e.lag; break; // S.EF >= P.ES+lag -> P.LS = S.LF-lag; LF=LS+dur
            case 'FS':
            default:   candidate = s.ls - e.lag; break;
          }
          if (candidate < lf) lf = candidate;
        });
      }
      r.lf = lf;
      r.ls = lf - r.duration;
      r.slack = r.ls - r.es;
      r.critical = r.slack <= 0;
    });

    // Convert indices to dates for rendering.
    tasks.forEach(function (t) {
      var r = result[t.id];
      r.startDate = calendar.indexToDate(r.es);
      // end date = last working day of the task (ef is exclusive).
      r.endDate = calendar.indexToDate(Math.max(r.es, r.ef - 1));
    });

    return {
      tasks: result,
      projectFinish: projectFinish,        // working-day index (exclusive end)
      finishDate: calendar.indexToDate(Math.max(0, projectFinish - 1)),
      horizon: horizon,
      deadlineIndex: deadlineDate ? calendar.dateToIndex(GA.dateUtil.parseDate(deadlineDate)) : null,
      feasible: deadlineDate ? projectFinish <= horizon : true,
      cycle: false,
    };
  }

  GA.scheduler = {
    schedule: schedule,
    computeDuration: computeDuration,
    topoSort: topoSort,
    DEP_TYPES: DEP_TYPES,
  };
})(window.GA = window.GA || {});

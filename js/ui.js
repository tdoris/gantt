/*
 * ui.js — side panels and modals: task editor, resource editor, dependency
 * editor, project settings, and the what-if analysis panel.
 *
 * Everything reads/writes GA.app.project and calls GA.app.refresh() to
 * reschedule + re-render.
 */
(function (GA) {
  'use strict';

  var app; // set in init

  function init(appRef) { app = appRef; }

  // ---------- helpers ----------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(n) {
    return '$' + Math.round(n).toLocaleString();
  }
  function field(label, inner) {
    var f = el('label', 'field');
    f.appendChild(el('span', 'field-label', label));
    f.appendChild(inner);
    return f;
  }
  function input(type, value, attrs) {
    var i = el('input');
    i.type = type;
    if (value != null) i.value = value;
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    return i;
  }
  function resourceOptions(selected) {
    return app.project.resources.map(function (r) {
      return '<option value="' + r.id + '"' + (r.id === selected ? ' selected' : '') + '>' +
        esc(r.name) + '</option>';
    }).join('');
  }

  // ---------- generic drawer ----------
  var drawer = null;
  function openDrawer(title, bodyBuilder) {
    closeDrawer();
    var overlay = el('div', 'drawer-overlay');
    var panel = el('div', 'drawer');
    var head = el('div', 'drawer-head');
    head.appendChild(el('h2', null, esc(title)));
    var close = el('button', 'drawer-close', '×');
    close.addEventListener('click', closeDrawer);
    head.appendChild(close);
    panel.appendChild(head);
    var body = el('div', 'drawer-body');
    panel.appendChild(body);
    bodyBuilder(body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDrawer(); });
    document.body.appendChild(overlay);
    drawer = overlay;
  }
  function closeDrawer() { if (drawer) { drawer.remove(); drawer = null; } }

  // ---------- Task editor ----------
  function editTask(taskId) {
    var p = app.project;
    var t = p.tasks.find(function (x) { return x.id === taskId; });
    if (!t) return;

    openDrawer('Edit task', function (body) {
      var nameI = input('text', t.name);
      body.appendChild(field('Name', nameI));

      var descI = el('textarea');
      descI.value = t.description || '';
      descI.rows = 3;
      body.appendChild(field('Description', descI));

      // Effort model toggle
      var fixed = (t.work == null);
      var modeSel = el('select');
      modeSel.innerHTML =
        '<option value="effort"' + (!fixed ? ' selected' : '') + '>Effort-driven (work ÷ units)</option>' +
        '<option value="fixed"' + (fixed ? ' selected' : '') + '>Fixed duration</option>';
      body.appendChild(field('Scheduling mode', modeSel));

      var workI = input('number', t.work != null ? t.work : 5, { min: '1', step: '1' });
      var workField = field('Work (person-days)', workI);
      var durI = input('number', t.duration != null ? t.duration : 5, { min: '1', step: '1' });
      var durField = field('Duration (working days)', durI);
      body.appendChild(workField);
      body.appendChild(durField);

      var resSel = el('select');
      resSel.innerHTML = resourceOptions(t.resourceId);
      body.appendChild(field('Driving resource', resSel));

      var unitsI = input('number', t.units || 1, { min: '1', step: '1' });
      body.appendChild(field('Assigned units', unitsI));

      var maxI = input('number', t.maxUnits != null ? t.maxUnits : '', { min: '1', step: '1', placeholder: 'resource capacity' });
      body.appendChild(field('Max units (crash limit)', maxI));

      var progI = input('number', t.progress || 0, { min: '0', max: '100', step: '5' });
      body.appendChild(field('Progress %', progI));

      // Manual start constraint (set by dragging the bar). Shown only when set.
      if (t.constraintStart != null) {
        var cwrap = el('div', 'constraint-note');
        var cdate = app.calendar.indexToDate(t.constraintStart);
        cwrap.innerHTML = '📌 Starts no earlier than <b>' + esc(GA.dateUtil.fmtShort(cdate)) + '</b> ';
        var clearBtn = el('button', 'link-btn', 'clear constraint');
        clearBtn.addEventListener('click', function () {
          t.constraintStart = null;
          app.persist();
          app.refresh();
          closeDrawer();
          editTask(t.id);
        });
        cwrap.appendChild(clearBtn);
        body.appendChild(cwrap);
      }

      function syncMode() {
        var eff = modeSel.value === 'effort';
        workField.style.display = eff ? '' : 'none';
        durField.style.display = eff ? 'none' : '';
        unitsI.parentElement.style.display = eff ? '' : 'none';
        maxI.parentElement.style.display = eff ? '' : 'none';
      }
      modeSel.addEventListener('change', syncMode);
      syncMode();

      // Predecessors editor
      body.appendChild(el('h3', 'sub', 'Dependencies (predecessors)'));
      var depList = el('div', 'dep-list');
      body.appendChild(depList);
      renderPredecessors(depList, t);

      // Add predecessor row
      var addWrap = el('div', 'dep-add');
      var predSel = el('select');
      predSel.innerHTML = '<option value="">— add predecessor —</option>' +
        p.tasks.filter(function (x) { return x.id !== t.id; }).map(function (x) {
          return '<option value="' + x.id + '">' + esc(x.name) + '</option>';
        }).join('');
      var typeSel = el('select');
      typeSel.innerHTML = GA.scheduler.DEP_TYPES.map(function (d) {
        return '<option value="' + d + '">' + d + '</option>';
      }).join('');
      var lagI = input('number', 0, { step: '1', title: 'lag (working days)' });
      lagI.style.width = '60px';
      var addBtn = el('button', 'btn small', 'Add');
      addBtn.addEventListener('click', function () {
        if (!predSel.value) return;
        var added = GA.store.addDependency(p, predSel.value, t.id, typeSel.value, +lagI.value || 0);
        if (!added) { flash(addBtn, 'Would create a cycle'); return; }
        app.persist();
        renderPredecessors(depList, t);
        app.refresh();
      });
      addWrap.appendChild(predSel);
      addWrap.appendChild(typeSel);
      addWrap.appendChild(lagI);
      addWrap.appendChild(addBtn);
      body.appendChild(addWrap);

      // Footer actions
      var footer = el('div', 'drawer-footer');
      var saveBtn = el('button', 'btn primary', 'Save');
      saveBtn.addEventListener('click', function () {
        t.name = nameI.value.trim() || 'Task';
        t.description = descI.value;
        if (modeSel.value === 'effort') {
          t.work = Math.max(1, +workI.value || 1);
          t.duration = null;
          t.units = Math.max(1, +unitsI.value || 1);
          t.maxUnits = maxI.value === '' ? null : Math.max(1, +maxI.value);
        } else {
          t.work = null;
          t.duration = Math.max(1, +durI.value || 1);
          t.units = 1;
        }
        t.resourceId = resSel.value;
        t.progress = Math.max(0, Math.min(100, +progI.value || 0));
        app.persist();
        app.refresh();
        closeDrawer();
      });
      var delBtn = el('button', 'btn danger', 'Delete task');
      delBtn.addEventListener('click', function () {
        GA.store.removeTask(p, t.id);
        app.persist();
        app.refresh();
        closeDrawer();
      });
      footer.appendChild(saveBtn);
      footer.appendChild(delBtn);
      body.appendChild(footer);
    });
  }

  function renderPredecessors(container, task) {
    var p = app.project;
    container.innerHTML = '';
    var preds = p.dependencies.filter(function (d) { return d.to === task.id; });
    if (!preds.length) {
      container.appendChild(el('div', 'muted', 'No predecessors.'));
      return;
    }
    preds.forEach(function (d) {
      var from = p.tasks.find(function (x) { return x.id === d.from; });
      var row = el('div', 'dep-row');
      row.innerHTML = '<span>' + esc(from ? from.name : '?') + '</span>' +
        '<span class="pill">' + d.type + (d.lag ? ' ' + (d.lag > 0 ? '+' : '') + d.lag + 'd' : '') + '</span>';
      var rm = el('button', 'link-btn', 'remove');
      rm.addEventListener('click', function () {
        GA.store.removeDependency(p, d.id);
        app.persist();
        renderPredecessors(container, task);
        app.refresh();
      });
      row.appendChild(rm);
      container.appendChild(row);
    });
  }

  // ---------- Resource editor ----------
  function openResources() {
    openDrawer('Resources', function (body) {
      var list = el('div', 'res-list');
      body.appendChild(list);
      renderResources(list);

      var addBtn = el('button', 'btn primary', '+ Add resource');
      addBtn.addEventListener('click', function () {
        GA.store.addResource(app.project, { name: 'New role', costPerDay: 500, capacity: 1 });
        app.persist();
        renderResources(list);
        app.refresh();
      });
      body.appendChild(addBtn);
    });
  }

  function renderResources(container) {
    var p = app.project;
    container.innerHTML = '';
    var alloc = GA.whatif.overAllocations(p, app.sched);
    var allocById = {};
    alloc.forEach(function (a) { allocById[a.resourceId] = a; });

    p.resources.forEach(function (r) {
      var a = allocById[r.id] || {};
      var card = el('div', 'res-card' + (a.overallocated ? ' over' : ''));
      var nameI = input('text', r.name);
      var costI = input('number', r.costPerDay, { min: '0', step: '50' });
      var capI = input('number', r.capacity, { min: '1', step: '1' });

      card.appendChild(field('Name', nameI));
      var row = el('div', 'row2');
      row.appendChild(field('Cost / day', costI));
      row.appendChild(field('Capacity (units)', capI));
      card.appendChild(row);

      var stat = el('div', 'res-stat');
      stat.innerHTML = 'Peak demand: <b>' + (a.peak || 0) + '</b> / ' + r.capacity +
        (a.overallocated ? ' <span class="over-tag">over-allocated ' + a.conflictDays + 'd</span>' : ' <span class="ok-tag">ok</span>');
      card.appendChild(stat);

      var actions = el('div', 'res-actions');
      var saveBtn = el('button', 'btn small', 'Save');
      saveBtn.addEventListener('click', function () {
        r.name = nameI.value.trim() || 'Resource';
        r.costPerDay = Math.max(0, +costI.value || 0);
        r.capacity = Math.max(1, +capI.value || 1);
        app.persist();
        renderResources(container);
        app.refresh();
      });
      var delBtn = el('button', 'btn small danger', 'Delete');
      delBtn.addEventListener('click', function () {
        GA.store.removeResource(p, r.id);
        app.persist();
        renderResources(container);
        app.refresh();
      });
      actions.appendChild(saveBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  // ---------- Projects manager ----------
  function openProjects() {
    openDrawer('Projects', function (body) {
      body.appendChild(el('p', 'muted', 'Each project is saved separately in this browser. Use Export/Import (toolbar) to share a project as a file with someone else.'));

      var list = el('div', 'proj-list');
      body.appendChild(list);
      renderProjectList(list);

      var addBtn = el('button', 'btn primary', '+ New project');
      addBtn.addEventListener('click', function () {
        GA.store.newProject(app.workspace, 'Untitled project');
        app.persist();
        app.refresh();
        renderProjectList(list);
      });
      body.appendChild(addBtn);
    });
  }

  function renderProjectList(container) {
    var ws = app.workspace;
    container.innerHTML = '';
    ws.projects.forEach(function (p) {
      var active = p.id === ws.activeId;
      var card = el('div', 'proj-card' + (active ? ' active' : ''));

      var nameI = input('text', p.name);
      nameI.className = 'proj-name';
      card.appendChild(nameI);

      var meta = el('div', 'proj-meta',
        p.tasks.length + ' task' + (p.tasks.length === 1 ? '' : 's') +
        ' · ' + p.resources.length + ' resource' + (p.resources.length === 1 ? '' : 's') +
        (active ? ' · <b>open</b>' : ''));
      card.appendChild(meta);

      var actions = el('div', 'proj-actions');
      if (!active) {
        var openBtn = el('button', 'btn small primary', 'Open');
        openBtn.addEventListener('click', function () { app.switchTo(p.id); openProjects(); });
        actions.appendChild(openBtn);
      }
      var saveBtn = el('button', 'btn small', 'Rename');
      saveBtn.addEventListener('click', function () {
        GA.store.renameProject(app.workspace, p.id, nameI.value.trim() || p.name);
        app.persist();
        app.refresh();
        renderProjectList(container);
      });
      var dupBtn = el('button', 'btn small', 'Duplicate');
      dupBtn.addEventListener('click', function () {
        GA.store.duplicateProject(app.workspace, p.id);
        app.persist();
        app.refresh();
        renderProjectList(container);
      });
      var delBtn = el('button', 'btn small danger', 'Delete');
      delBtn.addEventListener('click', function () {
        if (!confirm('Delete project "' + p.name + '"? This cannot be undone.')) return;
        GA.store.deleteProject(app.workspace, p.id);
        app.persist();
        app.refresh();
        renderProjectList(container);
      });
      actions.appendChild(saveBtn);
      actions.appendChild(dupBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  // ---------- Project settings ----------
  function openSettings() {
    openDrawer('Project settings', function (body) {
      var p = app.project;
      var nameI = input('text', p.name);
      body.appendChild(field('Project name', nameI));
      var startI = input('date', p.startDate);
      body.appendChild(field('Start date', startI));
      var indI = input('number', p.indirectPerDay || 0, { min: '0', step: '100' });
      body.appendChild(field('Indirect cost / day (overhead)', indI));

      body.appendChild(el('h3', 'sub', 'Working days'));
      var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      var wd = el('div', 'weekday-row');
      var checks = [];
      dayNames.forEach(function (nm, i) {
        var lab = el('label', 'wd');
        var c = input('checkbox');
        c.checked = !!p.workdays[i];
        checks.push(c);
        lab.appendChild(c);
        lab.appendChild(el('span', null, nm));
        wd.appendChild(lab);
      });
      body.appendChild(wd);

      var footer = el('div', 'drawer-footer');
      var saveBtn = el('button', 'btn primary', 'Save');
      saveBtn.addEventListener('click', function () {
        p.name = nameI.value.trim() || 'Project';
        p.startDate = startI.value || p.startDate;
        p.indirectPerDay = Math.max(0, +indI.value || 0);
        p.workdays = checks.map(function (c) { return c.checked; });
        app.persist();
        app.refresh();
        closeDrawer();
      });
      footer.appendChild(saveBtn);
      body.appendChild(footer);
    });
  }

  // ---------- What-if panel ----------
  function openWhatIf() {
    openDrawer('What-if analysis', function (body) {
      var p = app.project;
      var base = GA.whatif.summarizeCost(p, app.sched);

      // Current snapshot
      var snap = el('div', 'wi-snapshot');
      snap.innerHTML =
        '<div><span class="k">Finish</span><b>' + GA.dateUtil.fmtShort(app.sched.finishDate) +
        '</b><small>' + app.sched.projectFinish + ' working days</small></div>' +
        '<div><span class="k">Direct cost</span><b>' + money(base.direct) + '</b></div>' +
        '<div><span class="k">Indirect</span><b>' + money(base.indirect) + '</b></div>' +
        '<div><span class="k">Total</span><b>' + money(base.total) + '</b></div>';
      body.appendChild(snap);

      // --- Deadline crashing ---
      body.appendChild(el('h3', 'sub', '① Hit a deadline'));
      body.appendChild(el('p', 'muted', 'Pick a target date. We add resources to critical tasks (cheapest-first) and report what it takes.'));
      var dl = input('date', GA.dateUtil.fmtDate(app.sched.finishDate));
      body.appendChild(field('Target finish date', dl));
      var runBtn = el('button', 'btn primary', 'Analyze deadline');
      body.appendChild(runBtn);
      var out = el('div', 'wi-out');
      body.appendChild(out);

      var lastPlan = null;
      runBtn.addEventListener('click', function () {
        var res = GA.whatif.crashToDeadline(p, app.calendar, dl.value);
        lastPlan = res;
        renderCrashResult(out, res);
      });

      // --- Cost/speed curve ---
      body.appendChild(el('h3', 'sub', '② Cost vs. speed of delivery'));
      body.appendChild(el('p', 'muted', 'The tradeoff curve across every achievable finish date, with the minimum-total-cost point marked.'));
      var curveBtn = el('button', 'btn', 'Compute curve');
      body.appendChild(curveBtn);
      var curveOut = el('div', 'wi-curve');
      body.appendChild(curveOut);
      curveBtn.addEventListener('click', function () {
        var curve = GA.whatif.costSpeedCurve(p, app.calendar);
        renderCurve(curveOut, curve);
      });
    });
  }

  function renderCrashResult(out, res) {
    if (res.error) { out.innerHTML = '<div class="wi-error">' + esc(res.error) + '</div>'; return; }
    out.innerHTML = '';
    var status = el('div', 'wi-status ' + (res.achieved ? 'ok' : 'fail'));
    status.innerHTML = res.achieved
      ? '✔ Deadline achievable — pulls finish in by <b>' + res.daysSaved + ' working days</b>.'
      : '✘ Deadline <b>not</b> reachable even fully crashed. Best possible finish: <b>' +
        GA.dateUtil.fmtShort(res.newFinishDate) + '</b> (' + res.daysSaved + 'd earlier).';
    out.appendChild(status);

    var grid = el('div', 'wi-grid');
    grid.innerHTML =
      cell('Baseline finish', GA.dateUtil.fmtShort(res.baseFinishDate)) +
      cell('New finish', GA.dateUtil.fmtShort(res.newFinishDate)) +
      cell('Days saved', res.daysSaved + 'd') +
      cell('Direct cost Δ', signMoney(res.directDelta)) +
      cell('Indirect cost Δ', signMoney(res.indirectDelta)) +
      cell('Total cost Δ', signMoney(res.costDelta));
    out.appendChild(grid);

    if (res.addedResources.length) {
      var rl = el('div', 'wi-added');
      rl.innerHTML = '<h4>Extra resources required</h4>';
      res.addedResources.forEach(function (a) {
        rl.appendChild(el('div', 'wi-added-row', '<span>' + esc(a.name) + '</span><b>+' + a.addedUnits + ' unit' + (a.addedUnits > 1 ? 's' : '') + '</b>'));
      });
      out.appendChild(rl);
    }

    if (res.steps.length) {
      var det = el('details', 'wi-steps');
      det.innerHTML = '<summary>' + res.steps.length + ' crash step' + (res.steps.length > 1 ? 's' : '') + ' (cheapest first)</summary>';
      var tbl = el('table', 'wi-table');
      tbl.innerHTML = '<tr><th>Task</th><th>Units</th><th>Days saved</th><th>$/day saved</th></tr>' +
        res.steps.map(function (s) {
          return '<tr><td>' + esc(s.taskName) + '</td><td>' + s.fromUnits + '→' + s.toUnits +
            '</td><td>' + s.saved + '</td><td>' + money(s.costPerDaySaved) + '</td></tr>';
        }).join('');
      det.appendChild(tbl);
      out.appendChild(det);
    }

    if (res.achieved || res.daysSaved > 0) {
      var apply = el('button', 'btn primary', 'Apply this plan to the project');
      apply.addEventListener('click', function () {
        app.replaceActive(res.resultingProject);
        app.persist();
        app.refresh();
        closeDrawer();
      });
      out.appendChild(apply);
    }
  }

  function renderCurve(container, curve) {
    container.innerHTML = '';
    var pts = curve.points;
    if (!pts.length) { container.innerHTML = '<div class="muted">No range to plot.</div>'; return; }

    // SVG line chart: x = duration (days), y = total cost.
    var W = 560, H = 220, PAD = 44;
    var xs = pts.map(function (p) { return p.durationDays; });
    var ysT = pts.map(function (p) { return p.total; });
    var ysD = pts.map(function (p) { return p.direct; });
    var ysI = pts.map(function (p) { return p.indirect; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = 0, yMax = Math.max.apply(null, ysT) * 1.05;

    function X(v) { return PAD + (xMax === xMin ? 0.5 : (v - xMin) / (xMax - xMin)) * (W - PAD - 12); }
    function Y(v) { return H - PAD - (v - yMin) / (yMax - yMin) * (H - PAD - 12); }
    function line(ys, color, dash) {
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(xs[i]) + ' ' + Y(ys[i]); }).join(' ');
      return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"' +
        (dash ? ' stroke-dasharray="4 3"' : '') + '/>';
    }

    var opt = curve.optimum;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="curve-svg">' +
      // axes
      '<line x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - 8) + '" y2="' + (H - PAD) + '" stroke="#cbd5e1"/>' +
      '<line x1="' + PAD + '" y1="8" x2="' + PAD + '" y2="' + (H - PAD) + '" stroke="#cbd5e1"/>' +
      line(ysI, '#38bdf8', true) +
      line(ysD, '#a78bfa', true) +
      line(ysT, '#0f766e', false) +
      // optimum marker
      '<circle cx="' + X(opt.durationDays) + '" cy="' + Y(opt.total) + '" r="5" fill="#16a34a"/>' +
      '<text x="' + X(opt.durationDays) + '" y="' + (Y(opt.total) - 10) + '" class="curve-opt" text-anchor="middle">optimum</text>' +
      // axis labels
      '<text x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="curve-axis">duration (working days) →</text>' +
      '<text x="12" y="' + (H / 2) + '" text-anchor="middle" class="curve-axis" transform="rotate(-90 12 ' + (H / 2) + ')">total cost →</text>' +
      '</svg>';

    var legend = '<div class="curve-legend">' +
      '<span><i style="background:#0f766e"></i>Total</span>' +
      '<span><i style="background:#a78bfa"></i>Direct</span>' +
      '<span><i style="background:#38bdf8"></i>Indirect</span></div>';

    var summary = '<div class="curve-summary">Cheapest delivery: <b>' + money(opt.total) +
      '</b> at <b>' + opt.durationDays + ' days</b> (' + GA.dateUtil.fmtShort(opt.finishDate) + '). ' +
      'Fastest: <b>' + curve.minFinish + ' days</b>. Slowest: <b>' + curve.normalFinish + ' days</b>.</div>';

    container.innerHTML = svg + legend + summary;
  }

  function cell(k, v) {
    return '<div class="wi-cell"><span>' + k + '</span><b>' + v + '</b></div>';
  }
  function signMoney(n) {
    var s = n >= 0 ? '+' : '−';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + s + money(Math.abs(n)) + '</span>';
  }
  function flash(btn, msg) {
    var old = btn.textContent;
    btn.textContent = msg;
    btn.classList.add('flash');
    setTimeout(function () { btn.textContent = old; btn.classList.remove('flash'); }, 1400);
  }

  GA.ui = {
    init: init,
    editTask: editTask,
    openResources: openResources,
    openSettings: openSettings,
    openWhatIf: openWhatIf,
    openProjects: openProjects,
  };
})(window.GA = window.GA || {});

/*
 * gantt.js — renders the Gantt chart: timeline header, task rows with bars,
 * dependency arrows (SVG overlay), critical-path highlighting, today marker,
 * and an optional deadline marker.
 */
(function (GA) {
  'use strict';

  var DAY_W = 26;   // px per working day column
  var ROW_H = 40;   // px per task row
  var HEADER_H = 48;

  // Render into `container`. ctx = { project, sched, calendar, onBarClick,
  // onEmptyChange, deadlineIndex }.
  function render(container, ctx) {
    var project = ctx.project;
    var sched = ctx.sched;
    var calendar = ctx.calendar;

    container.innerHTML = '';
    container.classList.add('gantt');

    if (sched.cycle) {
      container.innerHTML = '<div class="gantt-error">⚠ Dependency cycle detected. Remove a dependency to schedule.</div>';
      return;
    }

    var tasks = project.tasks;
    // Sort rows by early start then name for a readable cascade.
    var rows = tasks.slice().sort(function (a, b) {
      var ra = sched.tasks[a.id], rb = sched.tasks[b.id];
      if (ra.es !== rb.es) return ra.es - rb.es;
      return ra.ef - rb.ef;
    });
    var rowIndex = {};
    rows.forEach(function (t, i) { rowIndex[t.id] = i; });

    // Timeline width: a bit past the finish or the deadline, whichever is later.
    var lastDay = Math.max(sched.projectFinish, ctx.deadlineIndex || 0) + 3;
    var series = calendar.workingDaySeries(lastDay);
    var chartW = lastDay * DAY_W;
    var chartH = rows.length * ROW_H;

    // ---- Left task-name column + right scrollable chart ----
    var layout = el('div', 'gantt-layout');

    var nameCol = el('div', 'gantt-namecol');
    nameCol.style.paddingTop = HEADER_H + 'px';
    rows.forEach(function (t) {
      var r = sched.tasks[t.id];
      var cell = el('div', 'gantt-namecell' + (r.critical ? ' critical' : ''));
      cell.style.height = ROW_H + 'px';
      cell.innerHTML = '<span class="tname">' + esc(t.name) + '</span>' +
        '<span class="tmeta">' + r.duration + 'd · ' + resourceLabel(project, t) + '</span>';
      cell.title = t.description || '';
      cell.addEventListener('click', function () { ctx.onBarClick && ctx.onBarClick(t.id); });
      nameCol.appendChild(cell);
    });
    layout.appendChild(nameCol);

    var scroll = el('div', 'gantt-scroll');
    var canvas = el('div', 'gantt-canvas');
    canvas.style.width = chartW + 'px';
    canvas.style.height = (chartH + HEADER_H) + 'px';

    // Header (months + day columns)
    canvas.appendChild(buildHeader(series, chartH));

    // Weekend/gridlines already handled by header stripes; add today + deadline.
    var todayIdx = calendar.dateToIndex(new Date());
    if (todayIdx >= 0 && todayIdx <= lastDay) {
      canvas.appendChild(marker(todayIdx, chartH, 'today', 'Today'));
    }
    if (ctx.deadlineIndex != null) {
      canvas.appendChild(marker(ctx.deadlineIndex, chartH, 'deadline', 'Deadline'));
    }

    // Task bars
    rows.forEach(function (t, i) {
      var r = sched.tasks[t.id];
      var bar = el('div', 'gantt-bar' + (r.critical ? ' critical' : '') + (r.slack < 0 ? ' late' : ''));
      bar.style.left = (r.es * DAY_W) + 'px';
      bar.style.top = (HEADER_H + i * ROW_H + 8) + 'px';
      bar.style.width = Math.max(DAY_W * r.duration - 4, 6) + 'px';
      bar.style.height = (ROW_H - 16) + 'px';
      bar.title = t.name + '  (' + r.duration + 'd)\n' +
        'Start ' + GA.dateUtil.fmtShort(r.startDate) + ' · End ' + GA.dateUtil.fmtShort(r.endDate) +
        '\nSlack ' + r.slack + 'd' + (r.critical ? ' · CRITICAL' : '');
      // progress fill
      if (t.progress) {
        var prog = el('div', 'gantt-progress');
        prog.style.width = Math.min(100, t.progress) + '%';
        bar.appendChild(prog);
      }
      var lbl = el('span', 'gantt-barlabel');
      // Pin prefix marks a manual start constraint (set by dragging).
      var pin = t.constraintStart != null ? '📌 ' : '';
      lbl.textContent = pin + (t.units > 1 ? (t.name + '  ×' + t.units) : t.name);
      bar.appendChild(lbl);
      // Right-edge resize handle.
      var handle = el('div', 'gantt-bar-resize');
      handle.title = 'Drag to change duration';
      bar.appendChild(handle);
      makeDraggable(bar, handle, t, r, ctx);
      // slack ghost
      if (r.slack > 0) {
        var ghost = el('div', 'gantt-slack');
        ghost.style.left = (r.ef * DAY_W) + 'px';
        ghost.style.top = (HEADER_H + i * ROW_H + ROW_H / 2 - 1) + 'px';
        ghost.style.width = (r.slack * DAY_W) + 'px';
        canvas.appendChild(ghost);
      }
      canvas.appendChild(bar);
    });

    // Dependency arrows (SVG overlay on top)
    canvas.appendChild(buildArrows(project, sched, rowIndex, chartW, chartH + HEADER_H));

    scroll.appendChild(canvas);
    layout.appendChild(scroll);
    container.appendChild(layout);
  }

  // Drag a bar body horizontally to set a start constraint; drag the right edge
  // to change duration. A click without movement opens the editor. All commits
  // go through ctx callbacks, which reschedule + re-render (cascading to
  // dependents), so we only need to preview the single dragged bar locally.
  function makeDraggable(bar, handle, t, r, ctx) {
    function startDrag(mode, e) {
      e.preventDefault();
      var startX = e.clientX;
      var origLeft = parseFloat(bar.style.left);
      var origWidth = parseFloat(bar.style.width);
      var moved = false;

      function onMove(ev) {
        var dx = ev.clientX - startX;
        if (Math.abs(dx) > 3) { moved = true; bar.classList.add('dragging'); }
        var days = Math.round(dx / DAY_W);
        if (mode === 'move') {
          bar.style.left = Math.max(0, origLeft + days * DAY_W) + 'px';
        } else {
          bar.style.width = Math.max(DAY_W - 4, origWidth + days * DAY_W) + 'px';
        }
      }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        bar.classList.remove('dragging');
        var days = Math.round((ev.clientX - startX) / DAY_W);
        if (!moved) { ctx.onBarClick && ctx.onBarClick(t.id); return; }
        if (days === 0) { // dragged but net-zero: snap the preview back
          bar.style.left = origLeft + 'px';
          bar.style.width = origWidth + 'px';
          return;
        }
        if (mode === 'move') {
          ctx.onBarDrag && ctx.onBarDrag(t.id, Math.max(0, r.es + days));
        } else {
          ctx.onBarResize && ctx.onBarResize(t.id, Math.max(1, r.duration + days));
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
    bar.addEventListener('mousedown', function (e) { startDrag('move', e); });
    handle.addEventListener('mousedown', function (e) { e.stopPropagation(); startDrag('resize', e); });
  }

  function buildHeader(series, chartH) {
    var header = el('div', 'gantt-header');
    header.style.height = HEADER_H + 'px';
    var months = el('div', 'gantt-months');
    var days = el('div', 'gantt-days');

    var curMonth = null, monthStart = 0;
    series.forEach(function (d, i) {
      var mk = d.date.getFullYear() + '-' + d.date.getMonth();
      if (mk !== curMonth) {
        if (curMonth !== null) months.appendChild(monthCell(curMonth, monthStart, i));
        curMonth = mk; monthStart = i;
      }
      var dc = el('div', 'gantt-daycell');
      dc.style.width = DAY_W + 'px';
      dc.textContent = d.date.getDate();
      // Monday shading for weekly rhythm.
      if (d.weekday === 1) dc.classList.add('weekstart');
      days.appendChild(dc);
    });
    if (curMonth !== null) months.appendChild(monthCell(curMonth, monthStart, series.length));

    header.appendChild(months);
    header.appendChild(days);
    return header;
  }

  function monthCell(key, start, end) {
    var parts = key.split('-');
    var d = new Date(+parts[0], +parts[1], 1);
    var c = el('div', 'gantt-monthcell');
    c.style.left = (start * DAY_W) + 'px';
    c.style.width = ((end - start) * DAY_W) + 'px';
    c.textContent = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return c;
  }

  function marker(index, chartH, cls, label) {
    var m = el('div', 'gantt-marker ' + cls);
    m.style.left = (index * DAY_W) + 'px';
    m.style.height = (chartH + HEADER_H) + 'px';
    var tag = el('span', 'gantt-marker-label');
    tag.textContent = label;
    m.appendChild(tag);
    return m;
  }

  // SVG arrows from predecessor bar edge to successor bar edge.
  function buildArrows(project, sched, rowIndex, w, h) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gantt-arrows');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML =
      '<marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">' +
      '<polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8"/></marker>' +
      '<marker id="arrowhead-c" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">' +
      '<polygon points="0 0, 7 3.5, 0 7" fill="#ef4444"/></marker>';
    svg.appendChild(defs);

    project.dependencies.forEach(function (dep) {
      var rf = sched.tasks[dep.from], rt = sched.tasks[dep.to];
      if (!rf || !rt) return;
      var fi = rowIndex[dep.from], ti = rowIndex[dep.to];
      if (fi == null || ti == null) return;

      // Anchor points depend on dependency type; keep it simple: from finish
      // edge to start edge for FS, adjust ends for others.
      var fromStart = (dep.type === 'SS' || dep.type === 'SF');
      var toFinish = (dep.type === 'FF' || dep.type === 'SF');

      var x1 = (fromStart ? rf.es : rf.ef) * DAY_W;
      var y1 = HEADER_H + fi * ROW_H + ROW_H / 2;
      var x2 = (toFinish ? rt.ef : rt.es) * DAY_W;
      var y2 = HEADER_H + ti * ROW_H + ROW_H / 2;

      var critical = rf.critical && rt.critical;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', routePath(x1, y1, x2, y2));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', critical ? '#ef4444' : '#94a3b8');
      path.setAttribute('stroke-width', critical ? '2' : '1.5');
      path.setAttribute('marker-end', critical ? 'url(#arrowhead-c)' : 'url(#arrowhead)');
      if (dep.type !== 'FS') path.setAttribute('stroke-dasharray', '4 3');
      svg.appendChild(path);
    });
    return svg;
  }

  // Orthogonal-ish routing with a small horizontal stub for readability.
  function routePath(x1, y1, x2, y2) {
    var stub = 12;
    var midX = x2 - stub;
    if (x2 >= x1) {
      return 'M ' + x1 + ' ' + y1 +
             ' H ' + (x1 + stub) +
             ' V ' + y2 +
             ' H ' + x2;
    }
    // successor starts before predecessor ends — route around.
    return 'M ' + x1 + ' ' + y1 +
           ' H ' + (x1 + stub) +
           ' V ' + ((y1 + y2) / 2) +
           ' H ' + (x2 - stub) +
           ' V ' + y2 +
           ' H ' + x2;
  }

  function resourceLabel(project, t) {
    var res = project.resources.find(function (r) { return r.id === t.resourceId; });
    return res ? res.name : '—';
  }

  // ---- tiny DOM helpers ----
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  }); }

  GA.gantt = { render: render, DAY_W: DAY_W, ROW_H: ROW_H };
})(window.GA = window.GA || {});

/*
 * main.js — application bootstrap. Owns the project state, rebuilds the
 * calendar + schedule on every change, renders the Gantt, and wires the toolbar.
 */
(function (GA) {
  'use strict';

  var app = {
    workspace: null,   // { activeId, projects: [...] }
    project: null,     // === activeProject(workspace); same object reference
    calendar: null,
    sched: null,
    deadlineIndex: null,

    persist: function () { GA.store.saveWorkspace(this.workspace); },

    rebuild: function () {
      this.calendar = new GA.Calendar(this.project.startDate, {
        workdays: this.project.workdays,
        holidays: this.project.holidays,
      });
      this.sched = GA.scheduler.schedule(this.project, this.calendar);
    },

    refresh: function () {
      this.project = GA.store.activeProject(this.workspace);
      this.rebuild();
      renderAll();
    },

    // Replace the active project's object (used by "apply plan" and "reset"),
    // keeping its identity so it stays the selected project in the workspace.
    replaceActive: function (proj) {
      proj.id = this.project.id;
      var i = this.workspace.projects.findIndex(function (p) { return p.id === proj.id; });
      if (i >= 0) this.workspace.projects[i] = proj; else this.workspace.projects.push(proj);
      this.workspace.activeId = proj.id;
      this.project = proj;
    },

    switchTo: function (id) {
      if (!this.workspace.projects.some(function (p) { return p.id === id; })) return;
      this.workspace.activeId = id;
      this.deadlineIndex = null;
      this.persist();
      this.refresh();
    },
  };

  function renderAll() {
    renderProjectSwitcher();
    renderStatusBar();
    GA.gantt.render(document.getElementById('gantt'), {
      project: app.project,
      sched: app.sched,
      calendar: app.calendar,
      deadlineIndex: app.deadlineIndex,
      onBarClick: function (taskId) { GA.ui.editTask(taskId); },
      onBarDrag: function (taskId, newStart) { setConstraint(taskId, newStart); },
      onBarResize: function (taskId, newDuration) { resizeTask(taskId, newDuration); },
    });
  }

  // Dragging a bar body sets a manual "start no earlier than" constraint.
  function setConstraint(taskId, newStart) {
    var t = app.project.tasks.find(function (x) { return x.id === taskId; });
    if (!t) return;
    t.constraintStart = newStart > 0 ? newStart : null;
    app.persist();
    app.refresh();
  }

  // Dragging the right edge changes duration. For effort-driven tasks we
  // back-solve the work so ceil(work/units) lands on the new duration; for
  // fixed-duration tasks we set the duration directly.
  function resizeTask(taskId, newDuration) {
    var t = app.project.tasks.find(function (x) { return x.id === taskId; });
    if (!t) return;
    if (t.work != null) {
      t.work = Math.max(1, newDuration * (t.units || 1));
    } else {
      t.duration = Math.max(1, newDuration);
    }
    app.persist();
    app.refresh();
  }

  function renderStatusBar() {
    var bar = document.getElementById('statusbar');
    var cost = GA.whatif.summarizeCost(app.project, app.sched);
    var alloc = GA.whatif.overAllocations(app.project, app.sched);
    var over = alloc.filter(function (a) { return a.overallocated; });
    var critical = app.project.tasks.filter(function (t) {
      var r = app.sched.tasks[t.id]; return r && r.critical;
    }).length;

    bar.innerHTML =
      stat('Project', esc(app.project.name)) +
      stat('Finish', app.sched.cycle ? '—' : GA.dateUtil.fmtShort(app.sched.finishDate)) +
      stat('Duration', app.sched.projectFinish + ' wd') +
      stat('Tasks', app.project.tasks.length + ' (' + critical + ' critical)') +
      stat('Total cost', money(cost.total)) +
      stat('Resource alerts', over.length
        ? '<span class="warn">' + over.length + ' over-allocated</span>'
        : '<span class="ok">none</span>');
  }

  // The quick-switch <select> in the toolbar, rebuilt on every refresh.
  function renderProjectSwitcher() {
    var sel = document.getElementById('project-select');
    if (!sel) return;
    sel.innerHTML = app.workspace.projects.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === app.workspace.activeId ? ' selected' : '') +
        '>' + esc(p.name) + '</option>';
    }).join('');
  }

  function stat(k, v) {
    return '<div class="stat"><span>' + k + '</span><b>' + v + '</b></div>';
  }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function wireToolbar() {
    document.getElementById('project-select').addEventListener('change', function (e) {
      app.switchTo(e.target.value);
    });
    document.getElementById('btn-projects').addEventListener('click', function () {
      GA.ui.openProjects();
    });
    document.getElementById('btn-add-task').addEventListener('click', function () {
      var t = GA.store.addTask(app.project, { name: 'New task', work: 5 });
      app.persist();
      app.refresh();
      GA.ui.editTask(t.id);
    });
    document.getElementById('btn-tutorial').addEventListener('click', function () { GA.tutorial.open(); });
    var linkTut = document.getElementById('link-tutorial');
    if (linkTut) linkTut.addEventListener('click', function (e) { e.preventDefault(); GA.tutorial.open(); });
    document.getElementById('btn-resources').addEventListener('click', GA.ui.openResources);
    document.getElementById('btn-settings').addEventListener('click', GA.ui.openSettings);
    document.getElementById('btn-whatif').addEventListener('click', GA.ui.openWhatIf);
    document.getElementById('btn-reset').addEventListener('click', function () {
      if (!confirm('Reset THIS project to the sample project? Its current contents will be lost.')) return;
      app.replaceActive(GA.store.sampleProject());
      app.persist();
      app.refresh();
    });
    document.getElementById('btn-export').addEventListener('click', exportJson);
    document.getElementById('btn-import').addEventListener('click', function () {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', importJson);
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(app.project, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (app.project.name || 'project').replace(/\s+/g, '-').toLowerCase() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var p = JSON.parse(reader.result);
        if (!p.tasks || !p.resources) throw new Error('Not a project file');
        // Import as a NEW project alongside existing ones (never overwrite).
        GA.store.importProject(app.workspace, p);
        app.persist();
        app.refresh();
      } catch (err) {
        alert('Could not import: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function boot() {
    app.workspace = GA.store.loadWorkspace();
    app.project = GA.store.activeProject(app.workspace);
    GA.app = app;
    GA.ui.init(app);
    wireToolbar();
    app.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.GA = window.GA || {});

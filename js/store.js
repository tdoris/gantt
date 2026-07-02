/*
 * store.js — data model, persistence (localStorage), and sample seed data.
 *
 * Project shape:
 * {
 *   name, startDate: "YYYY-MM-DD", indirectPerDay: Number,
 *   workdays: [Sun..Sat booleans], holidays: ["YYYY-MM-DD"],
 *   resources: [{ id, name, costPerDay, capacity }],
 *   tasks: [{
 *     id, name, description,
 *     work: personDays | null,   // if set, duration = ceil(work/units)
 *     duration: workingDays,      // used only when work == null (fixed duration)
 *     units: Number,              // assigned units of the driving resource
 *     maxUnits: Number | null,    // crash limit (defaults to resource capacity)
 *     resourceId: id,             // driving resource
 *     assignments: [{ resourceId, units }],  // extra resources
 *     progress: 0..100
 *   }],
 *   dependencies: [{ from, to, type: FS|SS|FF|SF, lag: workingDays }]
 * }
 */
(function (GA) {
  'use strict';

  var KEY = 'ga-gantt-project-v1';        // legacy single-project key
  var WKEY = 'ga-gantt-workspace-v1';     // workspace: many projects
  var idCounter = 1;

  function uid(prefix) {
    return (prefix || 'id') + '-' + (Date.now().toString(36)) + '-' + (idCounter++);
  }

  // ---- Workspace: a named collection of projects + which one is active ----

  function loadWorkspace() {
    // Preferred: the multi-project workspace.
    try {
      var raw = localStorage.getItem(WKEY);
      if (raw) return migrateWorkspace(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    // Fallback: migrate a legacy single project into a one-item workspace.
    try {
      var old = localStorage.getItem(KEY);
      if (old) {
        var p = migrate(JSON.parse(old));
        ensureProjectId(p);
        return { activeId: p.id, projects: [p] };
      }
    } catch (e) { /* ignore */ }
    // Fresh install: seed with the sample project.
    var sample = sampleProject();
    ensureProjectId(sample);
    return { activeId: sample.id, projects: [sample] };
  }

  function saveWorkspace(ws) {
    try {
      localStorage.setItem(WKEY, JSON.stringify(ws));
    } catch (e) { /* quota / private mode — ignore */ }
  }

  function migrateWorkspace(ws) {
    ws.projects = (ws.projects || []).map(function (p) {
      p = migrate(p);
      ensureProjectId(p);
      return p;
    });
    if (!ws.projects.length) {
      var s = sampleProject(); ensureProjectId(s); ws.projects.push(s);
    }
    if (!ws.projects.some(function (p) { return p.id === ws.activeId; })) {
      ws.activeId = ws.projects[0].id;
    }
    return ws;
  }

  function ensureProjectId(p) {
    if (!p.id) p.id = uid('proj');
    return p;
  }

  function activeProject(ws) {
    return ws.projects.find(function (p) { return p.id === ws.activeId; }) || ws.projects[0];
  }

  function newProject(ws, name) {
    var p = blankProject(name || 'Untitled project');
    ensureProjectId(p);
    ws.projects.push(p);
    ws.activeId = p.id;
    return p;
  }

  function duplicateProject(ws, id) {
    var src = ws.projects.find(function (p) { return p.id === id; });
    if (!src) return null;
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = uid('proj');
    copy.name = src.name + ' (copy)';
    ws.projects.push(copy);
    ws.activeId = copy.id;
    return copy;
  }

  function renameProject(ws, id, name) {
    var p = ws.projects.find(function (x) { return x.id === id; });
    if (p) p.name = name || p.name;
    return p;
  }

  function deleteProject(ws, id) {
    ws.projects = ws.projects.filter(function (p) { return p.id !== id; });
    if (!ws.projects.length) newProject(ws, 'Untitled project');
    if (!ws.projects.some(function (p) { return p.id === ws.activeId; })) {
      ws.activeId = ws.projects[0].id;
    }
  }

  // Import a project object (e.g. from a colleague's exported file) as a NEW
  // project so it sits alongside the user's own — never overwriting.
  function importProject(ws, obj) {
    var p = migrate(obj);
    p.id = uid('proj'); // always a fresh identity on import
    if (!p.name) p.name = 'Imported project';
    ws.projects.push(p);
    ws.activeId = p.id;
    return p;
  }

  function blankProject(name) {
    return {
      name: name,
      startDate: todayStr(),
      indirectPerDay: 0,
      coordinationPenalty: 0.20,
      workdays: [false, true, true, true, true, true, false],
      holidays: [],
      resources: [
        { id: uid('r'), name: 'Team', costPerDay: 600, capacity: 3 },
      ],
      tasks: [],
      dependencies: [],
    };
  }

  // ---- Legacy single-project API (still used by import/export helpers) ----

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return sampleProject();
  }

  function save(project) {
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
    } catch (e) { /* quota / private mode — ignore */ }
  }

  function migrate(p) {
    p.resources = p.resources || [];
    p.tasks = p.tasks || [];
    p.dependencies = p.dependencies || [];
    p.workdays = p.workdays || [false, true, true, true, true, true, false];
    p.holidays = p.holidays || [];
    p.indirectPerDay = p.indirectPerDay || 0;
    if (p.coordinationPenalty == null) p.coordinationPenalty = 0.20;
    p.tasks.forEach(function (t) {
      t.assignments = t.assignments || [];
      if (t.units == null) t.units = 1;
      if (t.progress == null) t.progress = 0;
      if (t.constraintStart === undefined) t.constraintStart = null;
    });
    return p;
  }

  function sampleProject() {
    var r = {
      dev:    { id: 'r-dev', name: 'Engineer', costPerDay: 800, capacity: 4 },
      design: { id: 'r-des', name: 'Designer', costPerDay: 700, capacity: 2 },
      qa:     { id: 'r-qa', name: 'QA', costPerDay: 600, capacity: 3 },
      pm:     { id: 'r-pm', name: 'PM', costPerDay: 900, capacity: 1 },
    };
    var t = {
      research:  mk('t1', 'Discovery & research', 'Interviews, competitive analysis', 6, r.pm.id, 1),
      design:    mk('t2', 'UX design', 'Wireframes and high-fidelity mockups', 12, r.design.id, 2),
      backend:   mk('t3', 'Backend API', 'Data model, endpoints, auth', 20, r.dev.id, 2),
      frontend:  mk('t4', 'Frontend build', 'UI implementation against API', 24, r.dev.id, 2),
      integrate: mk('t5', 'Integration', 'Wire frontend to backend', 8, r.dev.id, 2),
      qa:        mk('t6', 'QA & bug-fix', 'Test passes and fixes', 10, r.qa.id, 2),
      launch:    mk('t7', 'Launch prep', 'Docs, deploy, go-live', 4, r.pm.id, 1),
    };
    var tasks = [t.research, t.design, t.backend, t.frontend, t.integrate, t.qa, t.launch];
    var deps = [
      dep(t.research.id, t.design.id, 'FS', 0),
      dep(t.research.id, t.backend.id, 'FS', 0),
      dep(t.design.id, t.frontend.id, 'FS', 0),
      dep(t.backend.id, t.integrate.id, 'FS', 0),
      dep(t.frontend.id, t.integrate.id, 'FS', 0),
      dep(t.integrate.id, t.qa.id, 'FS', 0),
      dep(t.qa.id, t.launch.id, 'FS', 0),
    ];
    return {
      id: uid('proj'),
      name: 'Sample Product Launch',
      startDate: todayStr(),
      indirectPerDay: 1500,
      coordinationPenalty: 0.20,
      workdays: [false, true, true, true, true, true, false],
      holidays: [],
      resources: [r.dev, r.design, r.qa, r.pm],
      tasks: tasks,
      dependencies: deps,
    };
  }

  function mk(id, name, desc, work, resourceId, units) {
    return {
      id: id, name: name, description: desc,
      work: work, duration: null, units: units || 1, maxUnits: null,
      resourceId: resourceId, assignments: [], progress: 0, constraintStart: null,
    };
  }

  function dep(from, to, type, lag) {
    return { id: uid('d'), from: from, to: to, type: type || 'FS', lag: lag || 0 };
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Mutations return the project for convenience; callers persist + re-render.
  function addTask(project, partial) {
    var task = {
      id: uid('t'),
      name: partial.name || 'New task',
      description: partial.description || '',
      work: partial.work != null ? partial.work : 5,
      duration: partial.duration != null ? partial.duration : null,
      units: partial.units || 1,
      maxUnits: partial.maxUnits != null ? partial.maxUnits : null,
      resourceId: partial.resourceId || (project.resources[0] && project.resources[0].id) || null,
      assignments: partial.assignments || [],
      progress: partial.progress || 0,
      constraintStart: partial.constraintStart != null ? partial.constraintStart : null,
    };
    project.tasks.push(task);
    return task;
  }

  function removeTask(project, taskId) {
    project.tasks = project.tasks.filter(function (t) { return t.id !== taskId; });
    project.dependencies = project.dependencies.filter(function (d) {
      return d.from !== taskId && d.to !== taskId;
    });
  }

  function addResource(project, partial) {
    var res = {
      id: uid('r'),
      name: partial.name || 'New resource',
      costPerDay: partial.costPerDay != null ? partial.costPerDay : 500,
      capacity: partial.capacity != null ? partial.capacity : 1,
    };
    project.resources.push(res);
    return res;
  }

  function removeResource(project, resourceId) {
    project.resources = project.resources.filter(function (r) { return r.id !== resourceId; });
    project.tasks.forEach(function (t) {
      if (t.resourceId === resourceId) t.resourceId = project.resources[0] && project.resources[0].id || null;
      t.assignments = (t.assignments || []).filter(function (a) { return a.resourceId !== resourceId; });
    });
  }

  function addDependency(project, from, to, type, lag) {
    if (from === to) return null;
    // prevent duplicates
    var exists = project.dependencies.some(function (d) { return d.from === from && d.to === to; });
    if (exists) return null;
    // prevent obvious cycles: adding from->to must keep the graph acyclic
    var trial = project.dependencies.concat([{ from: from, to: to, type: type || 'FS', lag: lag || 0 }]);
    var topo = GA.scheduler.topoSort(project.tasks, trial);
    if (topo.cycle) return null;
    var d = dep(from, to, type, lag);
    project.dependencies.push(d);
    return d;
  }

  function removeDependency(project, depId) {
    project.dependencies = project.dependencies.filter(function (d) { return d.id !== depId; });
  }

  GA.store = {
    load: load, save: save, uid: uid,
    sampleProject: sampleProject,
    addTask: addTask, removeTask: removeTask,
    addResource: addResource, removeResource: removeResource,
    addDependency: addDependency, removeDependency: removeDependency,
    // workspace / multi-project
    loadWorkspace: loadWorkspace, saveWorkspace: saveWorkspace,
    activeProject: activeProject, newProject: newProject,
    duplicateProject: duplicateProject, renameProject: renameProject,
    deleteProject: deleteProject, importProject: importProject,
  };
})(window.GA = window.GA || {});

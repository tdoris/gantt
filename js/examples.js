/*
 * examples.js — ready-made teaching projects, loadable from the Projects panel.
 *
 * Each example is designed to make one concept obvious:
 *   1. Mobile App v1.0   — critical path, slack, and crashing to a deadline.
 *   2. Office Relocation — dependency types (FS/SS/FF), lag, and a deliberate
 *                          resource over-allocation you can see and fix.
 *   3. Conference 2026   — the cost-vs-time tradeoff with a real interior
 *                          optimum (fastest is NOT cheapest).
 *
 * GA.examples is an array of builder functions so each call returns a fresh,
 * independent copy (safe to import repeatedly).
 */
(function (GA) {
  'use strict';

  var uid = GA.store.uid;

  // Compact spec -> full project object.
  function build(spec) {
    var resKeyId = {};
    var resources = spec.resources.map(function (r) {
      var id = uid('r');
      resKeyId[r[0]] = id;
      return { id: id, name: r[0], costPerDay: r[1], capacity: r[2] };
    });
    var taskKeyId = {};
    var tasks = spec.tasks.map(function (t) {
      var id = uid('t');
      taskKeyId[t[0]] = id;
      return {
        id: id, name: t[1], description: t[2] || '',
        work: t[3], duration: null,
        resourceId: resKeyId[t[4]], units: t[5] || 1,
        maxUnits: t[6] != null ? t[6] : null,
        assignments: [], progress: 0, constraintStart: null,
      };
    });
    var dependencies = (spec.deps || []).map(function (d) {
      return { id: uid('d'), from: taskKeyId[d[0]], to: taskKeyId[d[1]], type: d[2] || 'FS', lag: d[3] || 0 };
    });
    return {
      id: uid('proj'),
      name: spec.name,
      startDate: spec.startDate,
      indirectPerDay: spec.indirectPerDay,
      coordinationPenalty: spec.coordinationPenalty != null ? spec.coordinationPenalty : 0.20,
      workdays: [false, true, true, true, true, true, false],
      holidays: [],
      resources: resources,
      tasks: tasks,
      dependencies: dependencies,
    };
  }

  // ---- 1. Mobile App v1.0 : critical path & crashing --------------------
  function mobileApp() {
    return build({
      name: 'Example 1 — Mobile App v1.0',
      startDate: '2026-08-03',
      indirectPerDay: 2000, // high overhead → time is expensive → crashing pays
      resources: [
        // [name, cost/day per unit, capacity]
        ['Engineer', 700, 6],
        ['Designer', 650, 2],
        ['QA', 550, 3],
        ['PM', 850, 1],
      ],
      tasks: [
        // [key, name, description, work(person-days), resourceKey, units]
        ['req',  'Requirements & kickoff', 'Scope, user stories, sign-off', 4, 'PM', 1],
        ['ux',   'UX design', 'Wireframes + high-fidelity screens', 10, 'Designer', 2],
        ['be',   'Backend services', 'API, data model, auth', 24, 'Engineer', 2],
        ['ios',  'iOS app', 'Native iOS client', 20, 'Engineer', 2],
        ['and',  'Android app', 'Native Android client', 20, 'Engineer', 2],
        ['int',  'Integration', 'Wire clients to backend', 8, 'Engineer', 2],
        ['qa',   'QA & bug-fix', 'Full regression + fixes', 12, 'QA', 2],
        ['ship', 'Launch', 'Store submission & go-live', 3, 'PM', 1],
      ],
      deps: [
        ['req', 'ux'], ['req', 'be'],
        ['ux', 'ios'], ['ux', 'and'],
        ['be', 'int'], ['ios', 'int'], ['and', 'int'],
        ['int', 'qa'], ['qa', 'ship'],
      ],
    });
  }

  // ---- 2. Office Relocation : dependency types + over-allocation ---------
  function officeMove() {
    return build({
      name: 'Example 2 — Office Relocation',
      startDate: '2026-09-01',
      indirectPerDay: 1000,
      resources: [
        ['Facilities Lead', 550, 1], // capacity 1 → the bottleneck we overload
        ['Movers', 300, 6],
        ['IT Tech', 600, 2],
        ['PM', 800, 1],
      ],
      tasks: [
        ['lease',  'Site selection & lease', 'Choose site, sign lease', 6, 'PM', 1],
        ['plan',   'Floor plan & fit-out design', 'Layout, desks, meeting rooms', 8, 'Facilities Lead', 1],
        ['vendor', 'Vendor negotiations', 'Furniture + build contractors', 6, 'Facilities Lead', 1],
        ['furn',   'Furniture delivery', 'Order → delivery lead time', 3, 'Movers', 2],
        ['it',     'IT infrastructure', 'Network, cabling, servers', 12, 'IT Tech', 2],
        ['move',   'Physical move', 'Relocate people & equipment', 10, 'Movers', 5],
        ['setup',  'Workstation setup', 'Provision desks & devices', 8, 'IT Tech', 2],
        ['onboard','On-site onboarding', 'Orientation at new office', 4, 'PM', 1],
      ],
      deps: [
        ['lease', 'plan'],
        ['lease', 'vendor'],          // vendor runs in PARALLEL with plan -> both need Facilities Lead (cap 1) => OVER-ALLOCATED
        ['plan', 'it'],
        ['vendor', 'furn', 'FS', 8],  // FS with 8-day delivery LAG
        ['it', 'setup', 'SS', 2],     // setup can START 2 days after IT starts (Start-to-Start)
        ['furn', 'move'], ['setup', 'move'],
        ['move', 'onboard'],
      ],
    });
  }

  // ---- 3. Conference 2026 : cost vs time optimization -------------------
  function conference() {
    return build({
      name: 'Example 3 — Conference 2026',
      startDate: '2026-10-01',
      indirectPerDay: 900, // tuned so the cheapest plan is NOT the fastest
      resources: [
        ['Coordinator', 500, 3],
        ['Marketing', 450, 3],
        ['Ops', 400, 4],
        ['Sponsor Mgr', 600, 2],
      ],
      tasks: [
        ['venue',  'Venue booking', 'Shortlist, negotiate, book', 8, 'Coordinator', 2],
        ['program','Program & speakers', 'Curate talks, confirm speakers', 18, 'Coordinator', 2],
        ['spons',  'Sponsorship sales', 'Prospect & close sponsors', 20, 'Sponsor Mgr', 2],
        ['market', 'Marketing campaign', 'Site, ads, email, social', 16, 'Marketing', 2],
        ['reg',    'Registration & ticketing', 'Platform + attendee flow', 8, 'Ops', 2],
        ['logi',   'Logistics & catering', 'AV, catering, signage, staffing', 14, 'Ops', 2],
        ['run',    'Run of show & rehearsal', 'Final schedule, dry run', 6, 'Coordinator', 2],
        ['event',  'Event day', 'Deliver the conference', 3, 'Ops', 3],
      ],
      deps: [
        ['venue', 'program'], ['venue', 'spons'],
        ['program', 'market'], ['spons', 'market'],
        ['market', 'reg'],
        ['program', 'logi'], ['venue', 'logi'],
        ['reg', 'run'], ['logi', 'run'],
        ['run', 'event'],
      ],
    });
  }

  GA.examples = [
    { key: 'mobile', title: 'Mobile App v1.0', teaches: 'Critical path & crashing', build: mobileApp },
    { key: 'office', title: 'Office Relocation', teaches: 'Dependency types & resource conflicts', build: officeMove },
    { key: 'conf',   title: 'Conference 2026', teaches: 'Cost-vs-time optimization', build: conference },
  ];
})(window.GA = window.GA || {});

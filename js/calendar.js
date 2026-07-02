/*
 * calendar.js — working-day calendar math.
 *
 * The scheduler works entirely in integer "working-day indices" (day 0 = the
 * project start date, day 1 = the next working day, ...). Weekends and holidays
 * are skipped. We only convert indices <-> real dates for rendering.
 */
(function (GA) {
  'use strict';

  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function parseDate(str) {
    // Accept "YYYY-MM-DD"; interpret as local midnight.
    var parts = String(str).split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function fmtDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function fmtShort(d) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function addDays(d, n) {
    return new Date(d.getTime() + n * MS_PER_DAY);
  }

  // A Calendar knows the project start, which weekdays are working days, and a
  // set of holiday dates (YYYY-MM-DD strings) that are also non-working.
  function Calendar(startDateStr, opts) {
    opts = opts || {};
    this.start = parseDate(startDateStr);
    // workdays[0..6] = Sun..Sat; default Mon-Fri.
    this.workdays = opts.workdays || [false, true, true, true, true, true, false];
    this.holidays = {};
    (opts.holidays || []).forEach(function (h) { this.holidays[h] = true; }, this);
  }

  Calendar.prototype.isWorkingDay = function (d) {
    if (!this.workdays[d.getDay()]) return false;
    if (this.holidays[fmtDate(d)]) return false;
    return true;
  };

  // Roll a date forward to the next working day (inclusive).
  Calendar.prototype.nextWorkingDay = function (d) {
    var cur = new Date(d.getTime());
    while (!this.isWorkingDay(cur)) cur = addDays(cur, 1);
    return cur;
  };

  // Convert a working-day index to a real calendar date.
  Calendar.prototype.indexToDate = function (index) {
    var cur = this.nextWorkingDay(this.start);
    var count = 0;
    while (count < index) {
      cur = addDays(cur, 1);
      if (this.isWorkingDay(cur)) count++;
    }
    return cur;
  };

  // Number of working days from project start up to (not including) a date.
  Calendar.prototype.dateToIndex = function (d) {
    var cur = this.nextWorkingDay(this.start);
    var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var index = 0;
    if (target <= cur) return 0;
    while (cur < target) {
      cur = addDays(cur, 1);
      if (this.isWorkingDay(cur)) index++;
    }
    return index;
  };

  // Build an array of {date, index, isMonthStart, isWeekStart} for `count`
  // working days starting at working-day index 0. Used for the timeline header.
  Calendar.prototype.workingDaySeries = function (count) {
    var out = [];
    var cur = this.nextWorkingDay(this.start);
    for (var i = 0; i < count; i++) {
      out.push({
        date: new Date(cur.getTime()),
        index: i,
        isMonthStart: cur.getDate() <= 3 || i === 0,
        weekday: cur.getDay(),
      });
      // advance to next working day
      do { cur = addDays(cur, 1); } while (!this.isWorkingDay(cur));
    }
    return out;
  };

  GA.Calendar = Calendar;
  GA.dateUtil = {
    parseDate: parseDate,
    fmtDate: fmtDate,
    fmtShort: fmtShort,
    addDays: addDays,
    MS_PER_DAY: MS_PER_DAY,
  };
})(window.GA = window.GA || {});

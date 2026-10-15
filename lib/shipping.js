'use strict';

// Ship and arrival windows in US business days, which skip weekends and US federal
// holidays. Dates are plain calendar days (held as UTC midnight) in US Eastern time.

const config = require('../config');
const { formatDate } = require('../format');

function day(year, month, date) {
  return new Date(Date.UTC(year, month, date));
}

// The nth weekday of a month (n = -1 for the last one). Weekday: 0 Sunday to 6 Saturday.
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = day(year, month, 1);
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return day(year, month, 1 + offset + (n - 1) * 7);
  }
  const last = day(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return day(year, month, last.getUTCDate() - offset);
}

// A fixed date holiday on a weekend is observed on the nearest weekday.
function observed(date) {
  const weekday = date.getUTCDay();
  if (weekday === 6) return day(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1);
  if (weekday === 0) return day(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return date;
}

const holidayCache = new Map();

function federalHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const dates = [
    observed(day(year, 0, 1)), // New Year's Day
    nthWeekday(year, 0, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 1, 1, 3), // Washington's Birthday
    nthWeekday(year, 4, 1, -1), // Memorial Day
    observed(day(year, 5, 19)), // Juneteenth
    observed(day(year, 6, 4)), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 9, 1, 2), // Columbus Day
    observed(day(year, 10, 11)), // Veterans Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observed(day(year, 11, 25)), // Christmas Day
  ];
  const set = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  holidayCache.set(year, set);
  return set;
}

function isBusinessDay(date) {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !federalHolidays(date.getUTCFullYear()).has(date.toISOString().slice(0, 10));
}

function addBusinessDays(start, count) {
  const date = new Date(start);
  let added = 0;
  while (added < count) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isBusinessDay(date)) added += 1;
  }
  return date;
}

// Today's calendar date in US Eastern time.
function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(now)
    .reduce((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  return day(parts.year, parts.month - 1, parts.day);
}

function range(from, to) {
  return from.getTime() === to.getTime() ? formatDate(from) : `${formatDate(from)} and ${formatDate(to)}`;
}

// { shipsLabel, arrivesFrom, arrivesTo, arrivesLabel } counted from a start date.
function estimate(start = today()) {
  const { makeDays, transitDays } = config.shipping;
  const arrivesFrom = addBusinessDays(start, makeDays.min + transitDays.min);
  const arrivesTo = addBusinessDays(start, makeDays.max + transitDays.max);
  return {
    shipsLabel: `${makeDays.min} to ${makeDays.max} business days`,
    arrivesFrom,
    arrivesTo,
    arrivesLabel: range(arrivesFrom, arrivesTo),
  };
}

module.exports = { estimate, today, addBusinessDays, isBusinessDay, federalHolidays };

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
};

function iso(d) {
  return d.toISOString().split("T")[0];
}

function lastDayOfMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0);
}

function monthRange(monthIdx, year) {
  const start = new Date(year, monthIdx, 1);
  const end = lastDayOfMonth(year, monthIdx);
  return { startDate: iso(start), endDate: iso(end) };
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function resolveDateRanges(question, lastContext) {
  const q = question.toLowerCase();
  const today = new Date();
  const ranges = [];

  const yearMatch = q.match(/\b(20\d{2})\b/);
  const fallbackYear = yearMatch ? parseInt(yearMatch[1], 10) : today.getFullYear();

  // "month1 vs month2" or "month1 and month2"
  const monthNames = Object.keys(MONTHS);
  const foundMonths = [];
  for (const name of monthNames) {
    const re = new RegExp(`\\b${name}\\b`, "g");
    let m;
    while ((m = re.exec(q)) !== null) {
      foundMonths.push({ name, idx: m.index });
    }
  }
  foundMonths.sort((a, b) => a.idx - b.idx);
  const uniqueMonths = [];
  for (const f of foundMonths) {
    if (!uniqueMonths.find(u => MONTHS[u.name] === MONTHS[f.name])) uniqueMonths.push(f);
  }

  if (uniqueMonths.length >= 1) {
    for (const m of uniqueMonths.slice(0, 2)) {
      ranges.push(monthRange(MONTHS[m.name], fallbackYear));
    }
    if (ranges.length) return ranges;
  }

  // "last N days"
  const lastN = q.match(/last\s+(\d{1,3})\s+days?/);
  if (lastN) {
    ranges.push({ startDate: `${lastN[1]}daysAgo`, endDate: "today" });
    return ranges;
  }

  // "last week" / "previous week"
  if (/\b(last|previous)\s+week\b/.test(q)) {
    const thisWeekStart = startOfWeek(today);
    const lastWeekStart = addDays(thisWeekStart, -7);
    const lastWeekEnd = addDays(thisWeekStart, -1);
    ranges.push({ startDate: iso(lastWeekStart), endDate: iso(lastWeekEnd) });
    if (/previous\s+week/.test(q) && /last\s+week/.test(q)) {
      const prevStart = addDays(lastWeekStart, -7);
      const prevEnd = addDays(lastWeekStart, -1);
      ranges.push({ startDate: iso(prevStart), endDate: iso(prevEnd) });
    }
    return ranges;
  }

  // "this week"
  if (/\bthis\s+week\b/.test(q)) {
    const s = startOfWeek(today);
    ranges.push({ startDate: iso(s), endDate: iso(today) });
    return ranges;
  }

  // "yesterday" / "today"
  if (/\byesterday\b/.test(q)) {
    const y = addDays(today, -1);
    ranges.push({ startDate: iso(y), endDate: iso(y) });
    return ranges;
  }
  if (/\btoday\b/.test(q)) {
    ranges.push({ startDate: iso(today), endDate: iso(today) });
    return ranges;
  }

  // Explicit ISO dates: YYYY-MM-DD to YYYY-MM-DD
  const isoRange = q.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-|and|vs|versus)\s*(\d{4}-\d{2}-\d{2})/);
  if (isoRange) {
    ranges.push({ startDate: isoRange[1], endDate: isoRange[2] });
    return ranges;
  }
  const singleIso = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (singleIso) {
    ranges.push({ startDate: singleIso[1], endDate: singleIso[1] });
    return ranges;
  }

  // Follow-up: "compare with previous week/month/period"
  if (lastContext?.dateRanges?.length && /previous|before|earlier/.test(q) && /compare|vs|versus/.test(q)) {
    const prev = lastContext.dateRanges[0];
    ranges.push(prev);
    const shifted = shiftRangeBack(prev);
    if (shifted) ranges.push(shifted);
    return ranges;
  }

  return [];
}

function shiftRangeBack(range) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.startDate)) return null;
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  const days = Math.round((end - start) / (24 * 3600 * 1000)) + 1;
  const newEnd = addDays(start, -1);
  const newStart = addDays(newEnd, -(days - 1));
  return { startDate: iso(newStart), endDate: iso(newEnd) };
}

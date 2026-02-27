/**
 * Converts a 12-hour slot string like "7-8am" to "07:00–08:00" when hourFormat is "24".
 */
export function fmtHour(h, hourFormat) {
  if(!h || hourFormat !== "24") return h;
  const m = h.match(/^(\d+)-(\d+)(am|pm)$/i);
  if(!m) return h;
  let start = parseInt(m[1]);
  const suf = m[3].toLowerCase();
  if(suf === "am") { if(start === 12) start = 0; }
  else             { if(start !== 12) start += 12; }
  const end = (start + 1) % 24;
  return `${String(start).padStart(2,"0")}:00–${String(end).padStart(2,"0")}:00`;
}

export function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
export function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }

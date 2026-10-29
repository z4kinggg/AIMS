// Merges both schools and applies hide rules.
import { getZeusEvents } from './zeus.js';
import { getEmnState } from './emn.js';
import { getRules, isHidden } from './rules.js';

export async function getCalendar({ start, end, includeHidden = false, force = false } = {}) {
  const [zeus, emn, rules] = await Promise.all([getZeusEvents({ force }), getEmnState(), getRules()]);
  let events = [...zeus.events, ...emn.events];
  if (start) events = events.filter(e => e.end > start);
  if (end) events = events.filter(e => e.start < end);
  events = events.map(e => ({ ...e, hidden: isHidden(e, rules) }));
  if (!includeHidden) events = events.filter(e => !e.hidden);
  return {
    events: events.sort((a, b) => a.start.localeCompare(b.start)),
    status: {
      zeus: zeus.status,
      emn: { updatedAt: emn.updatedAt, count: emn.events.length },
    },
    rules,
  };
}

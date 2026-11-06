// Merges both schools and applies hide rules.
import { getZeusEvents } from './zeus.js';
import { getEmnState } from './emn.js';
import { getRules, isHidden } from './rules.js';
import { markSharedSlots } from '../public/shared.js';

export async function getCalendar({ start, end, includeHidden = false, force = false } = {}) {
  const [zeus, emn, rules] = await Promise.all([getZeusEvents({ force }), getEmnState(), getRules()]);
  // Mark shared blocks before cutting to the date range, so each day is seen whole.
  let events = markSharedSlots([...zeus.events, ...emn.events]);
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

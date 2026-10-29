// Hide rules: remove classes you don't attend (other French groups, other tutoring slots…).
import crypto from 'node:crypto';
import * as store from './store.js';
import { matchesRule } from '../public/shared.js';

const KEY = 'rules';
// Rule types:
//   event    – hide one occurrence (value = event id)
//   title    – hide every class with exactly this title
//   contains – hide every class whose title, group or description contains the text (e.g. "GR2")
export const TYPES = ['event', 'title', 'contains'];

export async function getRules() { return (await store.get(KEY)) || []; }

export async function addRule({ type, value, source = 'any', label = '' }) {
  if (!TYPES.includes(type)) throw new Error('Unknown rule type');
  value = String(value || '').trim();
  if (!value) throw new Error('Rule needs a value');
  if (!['any', 'zeus', 'emn'].includes(source)) source = 'any';
  const rules = await getRules();
  const dupe = rules.find(r => r.type === type && r.value === value && r.source === source);
  if (dupe) return dupe;
  const rule = { id: crypto.randomUUID(), type, value, source, label: String(label).slice(0, 200), createdAt: Date.now() };
  await store.set(KEY, [...rules, rule]);
  return rule;
}

export async function removeRule(id) {
  const rules = await getRules();
  await store.set(KEY, rules.filter(r => r.id !== id));
}

export function isHidden(ev, rules) {
  return rules.some(r => matchesRule(ev, r));
}

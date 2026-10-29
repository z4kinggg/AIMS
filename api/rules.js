// GET list · POST {type,value,source,label} add · DELETE ?id= remove
import { getRules, addRule, removeRule } from '../lib/rules.js';
import { checkApp, checkAdmin, deny } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkApp(req)) return deny(res);
  try {
    if (req.method === 'GET') return res.status(200).json(await getRules());
    if (!checkAdmin(req)) return res.status(403).json({ error: 'Only the admin can hide classes for everyone' });
    if (req.method === 'POST') return res.status(200).json(await addRule(req.body || {}));
    if (req.method === 'DELETE') { await removeRule(req.query.id); return res.status(200).json({ ok: true }); }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

// POST /api/emn – called by the browser add-on with what MyEMN loaded.
// Body: { url: "<the MyEMN request URL>", data: <its JSON response> }
import { saveEmnPayload } from '../lib/emn.js';
import { checkSync, deny } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-sync-key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkSync(req)) return deny(res, 'Wrong sync key – copy it again from the site settings');
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || body.data === undefined) return res.status(400).json({ error: 'Expected { url, data }' });
    res.status(200).json(await saveEmnPayload(body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// GET /api/status – sync health plus the links you need for the phone and the add-on.
import { checkApp, checkAdmin, adminRequired, deny, feedToken, syncToken, configured } from '../lib/auth.js';
import { getZeusEvents } from '../lib/zeus.js';
import { getEmnState, getEmnRaw } from '../lib/emn.js';
import { storageKind, storageEnvNames } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.query.ping === '1') return res.status(200).json({ configured: configured(), storage: storageKind });
  if (!checkApp(req)) return deny(res);
  const [zeus, emn, raw] = await Promise.all([getZeusEvents(), getEmnState(), getEmnRaw()]);
  res.status(200).json({
    storage: storageKind,
    storageSettings: storageEnvNames,
    zeus: { configured: Boolean(process.env.ZEUS_ICS_URL), ...zeus.status, count: zeus.events.length },
    emn: { updatedAt: emn.updatedAt, count: emn.events.length, lastRequestUrl: raw?.url || null, lastSampleCount: raw?.count ?? null, lastReceivedAt: raw?.receivedAt || null },
    feedToken: feedToken(),
    admin: checkAdmin(req),
    adminRequired: adminRequired(),
    ...(checkAdmin(req) ? { syncToken: syncToken() } : {}),
    ...(req.query.raw === '1' && checkAdmin(req) ? { emnSample: raw ? `${raw.url}\n${raw.sample}` : null } : {}),
  });
}

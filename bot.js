require('dotenv').config();
const express = require('express');
const path = require('path');
const webpush = require('web-push');

// ===================== DONNÉES TONTINE =====================
const DATES = ['07/06/2026','14/06/2026','21/06/2026','28/06/2026','05/07/2026',
  '12/07/2026','19/07/2026','26/07/2026','02/08/2026','09/08/2026','16/08/2026',
  '23/08/2026','30/08/2026','06/09/2026','13/09/2026','20/09/2026','27/09/2026',
  '04/10/2026','11/10/2026'];
const TOTAL = 19, WEEKLY = 40000, ENGAGEMENT = TOTAL * WEEKLY;
const RECEPTIONS = { 15:'Nom 1', 16:'Nom 2', 17:'Nom 3', 18:'Nom 4' };

const MOTI = [
  "Chaque versement est une brique de ta liberté. Pose-la aujourd'hui.",
  "Tu ne cotises pas pour les autres : tu te paies d'abord toi-même.",
  "La régularité bat l'intensité. Verse, encore et encore.",
  "Ne saute aucune semaine : le vide casse l'élan.",
  "Ton futur toi te remerciera pour la semaine que tu boucles maintenant.",
  "Discipline aujourd'hui, récolte aux 4 derniers tours. Tiens le cap.",
  "Termine vite, termine fort. Objectif 100 %, pas 90.",
  "Une semaine cochée = une promesse tenue envers toi-même.",
  "Le plus dur était de commencer. C'est fait. Continue.",
  "Tu construis un capital ET un caractère. Coche ta semaine.",
  "La constance vient à bout de tout.",
  "Le sage économise pour les saisons sèches.",
  "La richesse se bâtit un versement à la fois.",
  "Petit budget, grande discipline, grand résultat. — Mylena Satoshi"
];
const SLOT_ORDER = ['matin','midi','soir'];

// ===================== HELPERS =====================
const fmt  = n => Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g,' ') + ' F';
const parse = d => { const p=d.split('/'); return new Date(+p[2],+p[1]-1,+p[0]); };
const sod  = dt => new Date(dt.getFullYear(),dt.getMonth(),dt.getDate());
const dayIdx = () => Math.floor(Date.now()/86400000);
const pick = (arr,seed) => arr[((seed%arr.length)+arr.length)%arr.length];

function autoSlot() {
  const h = new Date().getHours();
  return h < 11 ? 'matin' : h < 17 ? 'midi' : 'soir';
}
function nextDeadline() {
  const today = sod(new Date());
  for (let i=0; i<DATES.length; i++) {
    const diff = Math.round((sod(parse(DATES[i]))-today)/86400000);
    if (diff >= 0) return { idx:i, date:DATES[i], diff };
  }
  return null;
}

// Contenu de la notification push (titre + corps riche)
function pushPayload(slot) {
  const nd   = nextDeadline();
  const seed = dayIdx() * 3 + SLOT_ORDER.indexOf(slot);
  const moti = pick(MOTI, seed);
  const titles = { matin:'🌅 Réveil Tontine', midi:'☀️ Mi-journée Tontine', soir:'🌙 Bilan du soir' };

  let status;
  if (!nd) {
    status = '🎉 Les 19 semaines sont terminées ! Bravo.';
  } else if (nd.diff === 0) {
    status = `🚨 Versement aujourd'hui · Sem. ${nd.idx+1}/${TOTAL} · ${fmt(WEEKLY)}`;
    if (RECEPTIONS[nd.idx]) status += ` · 🏆 ${RECEPTIONS[nd.idx]} reçoit !`;
  } else {
    status = `⏳ J-${nd.diff} · Sem. ${nd.idx+1}/${TOTAL} · prépare ${fmt(WEEKLY)}`;
    if (RECEPTIONS[nd.idx]) status += ` · 🏆 ${RECEPTIONS[nd.idx]} reçoit bientôt`;
  }

  return { title: titles[slot] || '🔔 Ma Tontine', body: `${status}\n🔥 ${moti}`, url: '/' };
}

// ===================== UPSTASH REDIS =====================
async function redisCmd(cmd, ...args) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url) return null;
  const r = await fetch(url, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify([cmd, ...args])
  });
  return (await r.json()).result;
}
const dbGet = async k => { const r=await redisCmd('GET',k); return r?JSON.parse(r):null; };
const dbSet = async (k,v) => redisCmd('SET', k, JSON.stringify(v));

const defaultState = () => ({ paid:{}, received:{}, obs:{}, recvAmt:190000 });
const getState  = async () => (await dbGet('tontine:state'))  || defaultState();
const setState  = async s  => dbSet('tontine:state', s);
const getSubs   = async () => (await dbGet('tontine:subs'))   || [];
const upsertSub = async sub => {
  const subs = await getSubs();
  dbSet('tontine:subs', [...subs.filter(s=>s.endpoint!==sub.endpoint), sub]);
};
const removeSub = async ep => {
  dbSet('tontine:subs', (await getSubs()).filter(s=>s.endpoint!==ep));
};

// ===================== WEB PUSH =====================
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@tontine.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}
async function pushToAll(slot) {
  if (!process.env.VAPID_PUBLIC_KEY) return 0;
  const subs    = await getSubs();
  const payload = JSON.stringify(pushPayload(slot));
  if (!subs.length) { console.log('ℹ Aucune subscription enregistrée'); return 0; }
  const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s, payload)));
  // Nettoyer les subscriptions expirées (410 Gone)
  for (let i=0; i<results.length; i++) {
    if (results[i].status==='rejected' && results[i].reason?.statusCode===410)
      await removeSub(subs[i].endpoint);
  }
  const sent = results.filter(r=>r.status==='fulfilled').length;
  console.log(`✅ Push envoyé à ${sent}/${subs.length} appareil(s) — slot: ${slot}`);
  return sent;
}

// ===================== SERVEUR =====================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const checkKey = req =>
  !process.env.NOTIFY_KEY ||
  (req.query.key || req.headers['x-notify-key']) === process.env.NOTIFY_KEY;

// Health / keepalive
app.get('/health', (_, res) => res.send('🟢 Tontine OK'));
app.get('/ping',   (_, res) => res.json({ ok:true, ts:Date.now() }));

// ---- STATE (sync cross-device) ----
app.get('/api/state', async (_, res) => {
  try { res.json(await getState()); }
  catch(e) { res.status(500).json({ error:e.message }); }
});
app.post('/api/state', async (req, res) => {
  try { await setState(req.body); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

// ---- VAPID public key ----
app.get('/api/vapid-key', (_, res) => res.json({ key: process.env.VAPID_PUBLIC_KEY || '' }));

// ---- PUSH SUBSCRIPTIONS ----
app.post('/api/subscribe', async (req, res) => {
  try { await upsertSub(req.body); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});
app.delete('/api/subscribe', async (req, res) => {
  try { await removeSub(req.body.endpoint); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

// ---- PUSH STATUS ----
app.get('/api/push-status', async (_, res) => {
  try {
    const subs = await getSubs();
    res.json({ ok:true, count:subs.length, vapid:!!process.env.VAPID_PUBLIC_KEY, redis:!!process.env.UPSTASH_REDIS_REST_URL });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ---- DEBUG ----
app.get('/api/debug', async (_, res) => {
  const out = { ts: new Date().toISOString(), env:{} };
  out.env.VAPID_PUBLIC_KEY  = !!process.env.VAPID_PUBLIC_KEY;
  out.env.VAPID_PRIVATE_KEY = !!process.env.VAPID_PRIVATE_KEY;
  out.env.UPSTASH_URL       = !!process.env.UPSTASH_REDIS_REST_URL;
  out.env.UPSTASH_TOKEN     = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  out.env.NOTIFY_KEY        = !!process.env.NOTIFY_KEY;
  try { out.redis = { ok:true, pong: await redisCmd('PING') }; }
  catch(e) { out.redis = { ok:false, error:e.message }; }
  try {
    const s = await getState();
    out.state = { ok:true, paid_checks: Object.values(s.paid||{}).filter(Boolean).length, recvAmt:s.recvAmt };
  } catch(e) { out.state = { ok:false, error:e.message }; }
  try {
    const subs = await getSubs();
    out.subs = { ok:true, count:subs.length };
  } catch(e) { out.subs = { ok:false, error:e.message }; }
  out.next_push_preview = pushPayload(autoSlot());
  res.json(out);
});

// ---- NOTIFY (déclenché par cron-job.org) ----
app.all('/notify', async (req, res) => {
  if (!checkKey(req)) return res.status(401).json({ ok:false, error:'Clé invalide' });
  const slot = req.query.slot || autoSlot();
  try {
    const pushed = await pushToAll(slot);
    res.json({ ok:true, slot, pushed });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Tontine PWA Server — port ${PORT}`));
}
module.exports = { app, pushToAll, getState, setState };

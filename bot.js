/**
 * 🤖 Bot Telegram — Ma Tontine (full option)
 * - 3 rappels/jour (matin · midi · soir), chacun avec son ton, emojis, citation, motivation
 * - Commandes : /start /point /motivation /citation /aide
 * - Message calculé à partir des dates → toujours à jour, aucun état à synchroniser
 * - Déployable sur Render, déclenché par un cron externe (recommandé en free tier)
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');

// ===================== DONNÉES TONTINE =====================
const DATES = ['07/06/2026','14/06/2026','21/06/2026','28/06/2026','05/07/2026',
  '12/07/2026','19/07/2026','26/07/2026','02/08/2026','09/08/2026','16/08/2026',
  '23/08/2026','30/08/2026','06/09/2026','13/09/2026','20/09/2026','27/09/2026',
  '04/10/2026','11/10/2026'];
const TOTAL = 19;
const WEEKLY = 40000;                 // 4 noms × 10 000 F
const ENGAGEMENT = TOTAL * WEEKLY;    // 760 000 F
const RECEPTIONS = { 15: 'Nom 1', 16: 'Nom 2', 17: 'Nom 3', 18: 'Nom 4' };

// ===================== CONTENU =====================
const QUOTES = [
  { t: "Seul on va plus vite, ensemble on va plus loin.", a: "Proverbe africain" },
  { t: "Petit à petit, l'oiseau fait son nid.", a: "Proverbe" },
  { t: "Goutte à goutte, on remplit la cruche.", a: "Proverbe" },
  { t: "Un voyage de mille lieues commence par un seul pas.", a: "Lao Tseu" },
  { t: "On ne grimpe pas à l'arbre par les feuilles.", a: "Proverbe africain" },
  { t: "La discipline est le pont entre les objectifs et leur réalisation.", a: "Jim Rohn" },
  { t: "Celui qui déplace la montagne commence par les petites pierres.", a: "Confucius" },
  { t: "Qui veut aller loin ménage sa monture.", a: "Proverbe français" },
  { t: "La meilleure façon de prédire l'avenir, c'est de le créer.", a: "Peter Drucker" },
  { t: "La constance vient à bout de tout.", a: "Proverbe" },
  { t: "L'eau qui coule goutte à goutte finit par creuser le roc.", a: "Proverbe" },
  { t: "Rome ne s'est pas faite en un jour.", a: "Proverbe" },
  { t: "Le sage économise pour les saisons sèches.", a: "Proverbe africain" },
  { t: "Ce que tu fais chaque jour pèse plus que ce que tu fais parfois.", a: "Sagesse populaire" },
  { t: "La richesse se bâtit un versement à la fois.", a: "Sagesse populaire" },
  { t: "Tomber est permis, se relever est un devoir.", a: "Proverbe" },
  { t: "Ta volonté d'aujourd'hui paie ta liberté de demain.", a: "Mylena Satoshi" },
  { t: "Petit budget, grande discipline, grand résultat.", a: "Mylena Satoshi" }
];

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
  "Tu construis un capital ET un caractère. Coche ta semaine."
];

const INTRO = {
  matin: ["🌅 <b>Bonjour ! Nouvelle journée, nouvel élan</b>", "🌅 <b>Réveil gagnant</b>", "☕ <b>On démarre fort aujourd'hui</b>"],
  midi:  ["☀️ <b>Petite relance de midi</b>", "⚡ <b>Pause check : où en es-tu ?</b>", "🔔 <b>Rappel de la mi-journée</b>"],
  soir:  ["🌙 <b>Bilan du soir</b>", "🌙 <b>On ne casse pas la chaîne</b>", "✨ <b>Dernier point avant de dormir</b>"]
};
const CLOSER = {
  matin: "👉 Ouvre ton suivi et prépare ta semaine. Tu gères. 💪",
  midi:  "👉 Pas encore versé ? C'est le moment idéal. ⏱️",
  soir:  "👉 Coche ta semaine avant de dormir. Demain, on recommence. 🔁"
};
const SLOT_ORDER = ['matin', 'midi', 'soir'];

// ===================== HELPERS =====================
const fmt = (n) => Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') + ' F';
const parse = (d) => { const p = d.split('/'); return new Date(+p[2], +p[1] - 1, +p[0]); };
const sod = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
const dayIndex = (ref) => Math.floor((ref ? ref.getTime() : Date.now()) / 86400000);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pick = (arr, seed) => arr[((seed % arr.length) + arr.length) % arr.length];
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function nextDeadline(ref) {
  const today = sod(ref || new Date());
  for (let i = 0; i < DATES.length; i++) {
    const diff = Math.round((sod(parse(DATES[i])) - today) / 86400000);
    if (diff >= 0) return { idx: i, date: DATES[i], diff };
  }
  return null;
}

function autoSlot(ref) {
  const h = (ref || new Date()).getHours();
  if (h < 11) return 'matin';
  if (h < 17) return 'midi';
  return 'soir';
}

function quoteBlock(seed) {
  const q = pick(QUOTES, seed);
  return `💬 <i>« ${esc(q.t)} »</i>\n— <b>${esc(q.a)}</b>`;
}

// ===================== CONSTRUCTION DU MESSAGE =====================
function buildMessage(slot, ref) {
  ref = ref || new Date();
  slot = slot || autoSlot(ref);
  const seed = dayIndex(ref) * 3 + SLOT_ORDER.indexOf(slot);
  const nd = nextDeadline(ref);
  const moti = pick(MOTI, seed);
  const L = [];

  L.push(pick(INTRO[slot], seed));
  L.push('');

  if (!nd) {
    L.push('🎉 <b>Les 19 semaines sont terminées !</b>');
    L.push('Tu as tenu ta cotisation jusqu\'au bout. Respect. 🏆');
    L.push('');
    L.push(quoteBlock(seed));
    return L.join('\n');
  }

  const semaine = nd.idx + 1;
  const passees = nd.idx;
  const verseTheo = passees * WEEKLY;
  const pct = Math.round((verseTheo / ENGAGEMENT) * 100);
  const bar = '▰'.repeat(Math.round(pct / 10)) + '▱'.repeat(10 - Math.round(pct / 10));

  if (nd.diff === 0) {
    L.push(`🚨 <b>VERSEMENT AUJOURD'HUI — Semaine ${semaine}/${TOTAL}</b>`);
    L.push(`💵 À verser : <b>${fmt(WEEKLY)}</b> (4 noms × 10 000 F).`);
  } else {
    L.push(`⏳ <b>J-${nd.diff}</b> avant la semaine ${semaine}/${TOTAL} (le ${nd.date}).`);
    L.push(`💵 À préparer : <b>${fmt(WEEKLY)}</b>.`);
  }
  if (RECEPTIONS[nd.idx]) L.push(`🏆 Cette semaine, <b>${RECEPTIONS[nd.idx]} reçoit</b> !`);

  L.push('');
  L.push(`📊 Avancement : <b>${pct}%</b>  ${bar}`);
  L.push(`✅ ${passees}/${TOTAL} semaines échues · versé attendu ${fmt(verseTheo)} / ${fmt(ENGAGEMENT)}`);
  L.push('');
  L.push(quoteBlock(seed));
  L.push('');
  L.push(`🔥 ${moti}`);
  L.push('');
  L.push(CLOSER[slot]);
  return L.join('\n');
}

// ===================== API TELEGRAM =====================
const TG = () => process.env.TELEGRAM_TOKEN;
async function tg(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TG()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || JSON.stringify(data));
  return data.result;
}
async function send(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}
async function sendDaily(slot) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!TG() || !chatId) throw new Error('TELEGRAM_TOKEN / TELEGRAM_CHAT_ID manquants.');
  return send(chatId, buildMessage(slot));
}

// ===================== COMMANDES DU BOT =====================
async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim().toLowerCase();
  const cmd = text.split(/\s|@/)[0];

  if (cmd === '/start') {
    await send(chatId,
      `👋 <b>Bienvenue dans ton coach de tontine !</b>\n\n` +
      `Je t'enverrai des rappels chaque jour (matin · midi · soir) avec ton avancement, une citation et un boost de motivation. 💪\n\n` +
      `🆔 Ton chat ID : <code>${chatId}</code>\n` +
      `Mets-le dans la variable <b>TELEGRAM_CHAT_ID</b> du serveur.\n\n` +
      `Commandes : /point · /motivation · /citation · /aide`);
  } else if (cmd === '/point') {
    await send(chatId, buildMessage(autoSlot(new Date())));
  } else if (cmd === '/motivation') {
    await send(chatId, `🔥 ${rand(MOTI)}`);
  } else if (cmd === '/citation') {
    const q = rand(QUOTES);
    await send(chatId, `💬 <i>« ${esc(q.t)} »</i>\n— <b>${esc(q.a)}</b>`);
  } else if (cmd === '/aide' || cmd === '/help') {
    await send(chatId,
      `📖 <b>Aide</b>\n\n` +
      `/point — ton avancement maintenant\n` +
      `/motivation — un boost\n` +
      `/citation — une citation\n` +
      `/start — réafficher ton chat ID`);
  }
}

// ===================== SERVEUR =====================
const app = express();
app.use(express.json());
const SECRET = () => process.env.WEBHOOK_SECRET || process.env.NOTIFY_KEY || 'hook';

// Sert le tracker HTML (public/) à la racine — installable en PWA sur iPhone
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.send('🤖 Tontine Telegram OK — /preview · /notify?key= · /set-webhook?key=&url='));

// Aperçu (sans envoyer). ?slot=matin|midi|soir
app.get('/preview', (req, res) => {
  const slot = req.query.slot;
  res.type('text/html').send(buildMessage(slot).replace(/\n/g, '<br>'));
});

// Déclenché par le cron externe. ?key=...&slot=matin|midi|soir
app.all('/notify', async (req, res) => {
  const key = req.query.key || req.headers['x-notify-key'];
  if (process.env.NOTIFY_KEY && key !== process.env.NOTIFY_KEY)
    return res.status(401).json({ ok: false, error: 'Clé invalide' });
  try {
    const r = await sendDaily(req.query.slot);
    res.json({ ok: true, message_id: r.message_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Webhook Telegram (reçoit les commandes). URL : /telegram/webhook/<SECRET>
app.post('/telegram/webhook/:secret', async (req, res) => {
  if (req.params.secret !== SECRET()) return res.sendStatus(403);
  try { await handleUpdate(req.body); } catch (e) { console.error(e.message); }
  res.sendStatus(200); // toujours 200 pour Telegram
});

// Helper : enregistre le webhook. /set-webhook?key=...&url=https://ton-app.onrender.com
app.get('/set-webhook', async (req, res) => {
  if (process.env.NOTIFY_KEY && req.query.key !== process.env.NOTIFY_KEY)
    return res.status(401).json({ ok: false, error: 'Clé invalide' });
  if (!req.query.url) return res.status(400).json({ ok: false, error: 'Ajoute ?url=https://ton-app.onrender.com' });
  try {
    const hook = `${req.query.url.replace(/\/$/, '')}/telegram/webhook/${SECRET()}`;
    const r = await tg('setWebhook', { url: hook });
    res.json({ ok: true, webhook: hook, telegram: r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Cron interne optionnel (en free tier qui s'endort → préférer le cron externe)
if (process.env.RUN_CRON === 'true') {
  const tz = process.env.TZ || 'Africa/Abidjan';
  cron.schedule('0 8 * * *',  () => sendDaily('matin').catch(console.error), { timezone: tz });
  cron.schedule('0 13 * * *', () => sendDaily('midi').catch(console.error),  { timezone: tz });
  cron.schedule('0 20 * * *', () => sendDaily('soir').catch(console.error),  { timezone: tz });
  console.log('⏰ Cron interne actif (8h/13h/20h,', tz + ')');
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('🚀 Bot Telegram sur le port ' + PORT));
}

module.exports = { buildMessage, sendDaily, handleUpdate, app };

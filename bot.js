require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const webpush = require('web-push');

// ===================== DONNÉES TONTINE =====================
const DATES = ['07/06/2026','14/06/2026','21/06/2026','28/06/2026','05/07/2026',
  '12/07/2026','19/07/2026','26/07/2026','02/08/2026','09/08/2026','16/08/2026',
  '23/08/2026','30/08/2026','06/09/2026','13/09/2026','20/09/2026','27/09/2026',
  '04/10/2026','11/10/2026'];
const TOTAL = 19, WEEKLY = 40000, ENGAGEMENT = TOTAL * WEEKLY;
const RECEPTIONS = { 15: 'Nom 1', 16: 'Nom 2', 17: 'Nom 3', 18: 'Nom 4' };

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
  matin: ["🌅 <b>Bonjour ! Nouvelle journée, nouvel élan</b>","🌅 <b>Réveil gagnant</b>","☕ <b>On démarre fort aujourd'hui</b>"],
  midi:  ["☀️ <b>Petite relance de midi</b>","⚡ <b>Pause check : où en es-tu ?</b>","🔔 <b>Rappel de la mi-journée</b>"],
  soir:  ["🌙 <b>Bilan du soir</b>","🌙 <b>On ne casse pas la chaîne</b>","✨ <b>Dernier point avant de dormir</b>"]
};
const CLOSER = {
  matin: "👉 Ouvre ton suivi et prépare ta semaine. Tu gères. 💪",
  midi:  "👉 Pas encore versé ? C'est le moment idéal. ⏱️",
  soir:  "👉 Coche ta semaine avant de dormir. Demain, on recommence. 🔁"
};
const SLOT_ORDER = ['matin','midi','soir'];

// ===================== HELPERS =====================
const fmt = n => Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g,' ') + ' F';
const parse = d => { const p = d.split('/'); return new Date(+p[2],+p[1]-1,+p[0]); };
const sod = dt => new Date(dt.getFullYear(),dt.getMonth(),dt.getDate());
const dayIdx = ref => Math.floor((ref||new Date()).getTime()/86400000);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const pick = (arr,seed) => arr[((seed%arr.length)+arr.length)%arr.length];
const rand = arr => arr[Math.floor(Math.random()*arr.length)];

function nextDeadline(ref) {
  const today = sod(ref||new Date());
  for (let i=0;i<DATES.length;i++) {
    const diff = Math.round((sod(parse(DATES[i]))-today)/86400000);
    if (diff>=0) return {idx:i,date:DATES[i],diff};
  }
  return null;
}
function autoSlot(ref) {
  const h=(ref||new Date()).getHours();
  return h<11?'matin':h<17?'midi':'soir';
}
function buildMessage(slot,ref) {
  ref=ref||new Date(); slot=slot||autoSlot(ref);
  const seed=dayIdx(ref)*3+SLOT_ORDER.indexOf(slot);
  const nd=nextDeadline(ref), moti=pick(MOTI,seed), L=[];
  L.push(pick(INTRO[slot],seed)); L.push('');
  if (!nd) {
    L.push('🎉 <b>Les 19 semaines sont terminées !</b>');
    L.push("Tu as tenu ta cotisation jusqu'au bout. Respect. 🏆");
    L.push(''); L.push(`💬 <i>« ${esc(pick(QUOTES,seed).t)} »</i>\n— <b>${esc(pick(QUOTES,seed).a)}</b>`);
    return L.join('\n');
  }
  const sem=nd.idx+1, pass=nd.idx, vt=pass*WEEKLY, pct=Math.round(vt/ENGAGEMENT*100);
  const bar='▰'.repeat(Math.round(pct/10))+'▱'.repeat(10-Math.round(pct/10));
  if (nd.diff===0) { L.push(`🚨 <b>VERSEMENT AUJOURD'HUI — Semaine ${sem}/${TOTAL}</b>`); L.push(`💵 À verser : <b>${fmt(WEEKLY)}</b> (4 noms × 10 000 F).`); }
  else { L.push(`⏳ <b>J-${nd.diff}</b> avant la semaine ${sem}/${TOTAL} (le ${nd.date}).`); L.push(`💵 À préparer : <b>${fmt(WEEKLY)}</b>.`); }
  if (RECEPTIONS[nd.idx]) L.push(`🏆 Cette semaine, <b>${RECEPTIONS[nd.idx]} reçoit</b> !`);
  L.push(''); L.push(`📊 Avancement : <b>${pct}%</b>  ${bar}`);
  L.push(`✅ ${pass}/${TOTAL} semaines échues · versé attendu ${fmt(vt)} / ${fmt(ENGAGEMENT)}`);
  L.push(''); L.push(`💬 <i>« ${esc(pick(QUOTES,seed).t)} »</i>\n— <b>${esc(pick(QUOTES,seed).a)}</b>`);
  L.push(''); L.push(`🔥 ${moti}`); L.push(''); L.push(CLOSER[slot]);
  return L.join('\n');
}
function pushPayload(slot) {
  const nd=nextDeadline(), titles={matin:'🌅 Réveil Tontine',midi:'☀️ Relance mi-journée',soir:'🌙 Bilan du soir'};
  let body = nd ? (nd.diff===0 ? `🚨 Versement aujourd'hui — Semaine ${nd.idx+1}/${TOTAL}` : `⏳ J-${nd.diff} · Semaine ${nd.idx+1}/${TOTAL} · ${fmt(WEEKLY)} à préparer`) : '🎉 Cotisation terminée !';
  if (nd && RECEPTIONS[nd.idx]) body += ` · 🏆 ${RECEPTIONS[nd.idx]} reçoit !`;
  return { title: titles[slot]||'🔔 Ma Tontine', body, url: '/' };
}

// ===================== UPSTASH REDIS =====================
async function redisCmd(cmd,...args) {
  const url=process.env.UPSTASH_REDIS_REST_URL, token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url) return null;
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify([cmd,...args])});
  return (await r.json()).result;
}
async function dbGet(key) { const r=await redisCmd('GET',key); return r?JSON.parse(r):null; }
async function dbSet(key,val) { await redisCmd('SET',key,JSON.stringify(val)); }

function defaultState() { return {paid:{},received:{},obs:{},recvAmt:190000}; }
async function getState() { return (await dbGet('tontine:state')) || defaultState(); }
async function setState(s) { await dbSet('tontine:state',s); }
async function getSubs() { return (await dbGet('tontine:subs')) || []; }
async function upsertSub(sub) {
  const subs=await getSubs();
  await dbSet('tontine:subs',[...subs.filter(s=>s.endpoint!==sub.endpoint),sub]);
}
async function removeSub(endpoint) {
  const subs=await getSubs();
  await dbSet('tontine:subs',subs.filter(s=>s.endpoint!==endpoint));
}

// ===================== WEB PUSH =====================
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@tontine.app',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
}
async function pushToAll(slot) {
  if (!process.env.VAPID_PUBLIC_KEY) return 0;
  const subs=await getSubs(), payload=JSON.stringify(pushPayload(slot));
  const results=await Promise.allSettled(subs.map(s=>webpush.sendNotification(s,payload)));
  for (let i=0;i<results.length;i++) {
    if (results[i].status==='rejected'&&results[i].reason?.statusCode===410) await removeSub(subs[i].endpoint);
  }
  return results.filter(r=>r.status==='fulfilled').length;
}

// ===================== TELEGRAM =====================
const TG = () => process.env.TELEGRAM_TOKEN;
async function tg(method,payload) {
  const r=await fetch(`https://api.telegram.org/bot${TG()}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json(); if (!d.ok) throw new Error(d.description||JSON.stringify(d)); return d.result;
}
async function send(chatId,text) { return tg('sendMessage',{chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true}); }
async function sendDaily(slot) {
  const chatId=process.env.TELEGRAM_CHAT_ID;
  if (!TG()||!chatId) throw new Error('TELEGRAM_TOKEN / TELEGRAM_CHAT_ID manquants.');
  slot=slot||autoSlot();
  const [tgResult,pushCount]=await Promise.allSettled([send(chatId,buildMessage(slot)),pushToAll(slot)]);
  if (tgResult.status==='rejected') throw tgResult.reason;
  console.log(`✅ Telegram OK · Push: ${pushCount.value||0} appareil(s)`);
  return {message_id:tgResult.value?.message_id,pushed:pushCount.value||0};
}

// ===================== COMMANDES BOT =====================
async function handleUpdate(update) {
  const msg=update.message||update.edited_message;
  if (!msg||!msg.text) return;
  const chatId=msg.chat.id, cmd=msg.text.trim().toLowerCase().split(/\s|@/)[0];
  if (cmd==='/start') {
    await send(chatId,`👋 <b>Bienvenue dans ton coach de tontine !</b>\n\n`+
      `Je t'enverrai des rappels chaque jour (matin · midi · soir).\n\n`+
      `🆔 Ton chat ID : <code>${chatId}</code>\n\nCommandes : /point · /motivation · /citation · /aide`);
  } else if (cmd==='/point') { await send(chatId,buildMessage(autoSlot())); }
  else if (cmd==='/motivation') { await send(chatId,`🔥 ${rand(MOTI)}`); }
  else if (cmd==='/citation') { const q=rand(QUOTES); await send(chatId,`💬 <i>« ${esc(q.t)} »</i>\n— <b>${esc(q.a)}</b>`); }
  else if (cmd==='/aide'||cmd==='/help') { await send(chatId,`📖 <b>Aide</b>\n\n/point — avancement\n/motivation — boost\n/citation — citation\n/start — chat ID`); }
}

// ===================== SERVEUR =====================
const app=express();
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

const SECRET=()=>process.env.WEBHOOK_SECRET||process.env.NOTIFY_KEY||'hook';
const checkKey=req=>!process.env.NOTIFY_KEY||(req.query.key||req.headers['x-notify-key'])===process.env.NOTIFY_KEY;

app.get('/health',(_,res)=>res.send('🤖 Tontine OK'));
app.get('/preview',(req,res)=>res.type('text/html').send(buildMessage(req.query.slot).replace(/\n/g,'<br>')));

// ---- STATE API (cross-device sync) ----
app.get('/api/state',async(_,res)=>{
  try { res.json(await getState()); } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/state',async(req,res)=>{
  try { await setState(req.body); res.json({ok:true}); } catch(e){ res.status(500).json({error:e.message}); }
});

// ---- VAPID PUBLIC KEY ----
app.get('/api/vapid-key',(_,res)=>res.json({key:process.env.VAPID_PUBLIC_KEY||''}));

// ---- PUSH SUBSCRIPTIONS ----
app.post('/api/subscribe',async(req,res)=>{
  try { await upsertSub(req.body); res.json({ok:true}); } catch(e){ res.status(500).json({error:e.message}); }
});
app.delete('/api/subscribe',async(req,res)=>{
  try { await removeSub(req.body.endpoint); res.json({ok:true}); } catch(e){ res.status(500).json({error:e.message}); }
});

// ---- PUSH STATUS (diagnostic) ----
app.get('/api/push-status', async (_,res) => {
  try {
    const subs = await getSubs();
    res.json({ ok:true, count:subs.length, vapid:!!process.env.VAPID_PUBLIC_KEY, redis:!!process.env.UPSTASH_REDIS_REST_URL });
  } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

// ---- NOTIFY (cron trigger) ----
app.all('/notify',async(req,res)=>{
  if (!checkKey(req)) return res.status(401).json({ok:false,error:'Clé invalide'});
  try { const r=await sendDaily(req.query.slot); res.json({ok:true,...r}); }
  catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

// ---- TELEGRAM WEBHOOK ----
app.post('/telegram/webhook/:secret',async(req,res)=>{
  if (req.params.secret!==SECRET()) return res.sendStatus(403);
  try { await handleUpdate(req.body); } catch(e){ console.error(e.message); }
  res.sendStatus(200);
});
app.get('/set-webhook',async(req,res)=>{
  if (!checkKey(req)) return res.status(401).json({ok:false,error:'Clé invalide'});
  if (!req.query.url) return res.status(400).json({ok:false,error:'?url= requis'});
  try {
    const hook=`${req.query.url.replace(/\/$/,'')}/telegram/webhook/${SECRET()}`;
    const r=await tg('setWebhook',{url:hook});
    res.json({ok:true,webhook:hook,telegram:r});
  } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

// ---- CRON INTERNE (optionnel, préférer cron externe en free tier) ----
if (process.env.RUN_CRON==='true') {
  const tz=process.env.TZ||'Africa/Abidjan';
  cron.schedule('0 8 * * *', ()=>sendDaily('matin').catch(console.error),{timezone:tz});
  cron.schedule('0 13 * * *',()=>sendDaily('midi').catch(console.error), {timezone:tz});
  cron.schedule('0 20 * * *',()=>sendDaily('soir').catch(console.error), {timezone:tz});
  console.log('⏰ Cron interne actif (8h/13h/20h,',tz+')');
}

if (require.main===module) {
  const PORT=process.env.PORT||3000;
  app.listen(PORT,()=>console.log('🚀 Tontine Bot sur le port '+PORT));
}
module.exports={buildMessage,sendDaily,handleUpdate,app};

# 🤖 Bot Telegram — Ma Tontine (full option)

Rappels **3×/jour** (matin · midi · soir) sur Telegram, avec emojis, **citations** (proverbes africains + sagesse), barre de progression, alerte « qui reçoit cette semaine », motivation, et **commandes** (`/point`, `/motivation`, `/citation`). Toujours à jour : tout est calculé à partir des dates.

> ✅ Avantage Telegram vs WhatsApp : **aucune limite des 24h**, aucune vérification d'entreprise, mise en route en quelques minutes.

---

## 1. Créer le bot (3 min)

1. Sur Telegram, cherche **@BotFather** → envoie `/newbot`.
2. Donne un nom + un identifiant → tu reçois un **token** (`123456789:AA...`).
3. Garde ce token pour `TELEGRAM_TOKEN`.

## 2. Récupérer ton chat ID

1. `npm install` puis `cp .env.example .env` (mets au moins ton `TELEGRAM_TOKEN`).
2. `npm start`, puis sur Telegram envoie **/start** à ton bot.
   - ⚠️ En local, les commandes ne marchent que via webhook (étape 4). Méthode simple sans serveur :
     ouvre `https://api.telegram.org/bot<TON_TOKEN>/getUpdates` après avoir écrit à ton bot,
     et lis `"chat":{"id": ...}`.
3. Mets cette valeur dans `TELEGRAM_CHAT_ID`.

## 3. Tester le contenu

```bash
npm run preview              # affiche les 3 messages (matin/midi/soir) dans le terminal
# serveur lancé :
#   /preview?slot=soir       → aperçu sans envoyer
#   /notify?key=TA_CLE&slot=matin  → envoie sur Telegram
```

---

## 4. Déployer sur Render

1. Pousse ce dossier sur GitHub.
2. Render → **New + → Web Service** → connecte le repo.
   - Build : `npm install` · Start : `npm start` · Instance : **Free**
3. **Environment** → ajoute : `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTIFY_KEY`, `WEBHOOK_SECRET`, `TZ=Africa/Abidjan`, `RUN_CRON=false`.
4. Déploie → note ton URL, ex. `https://ma-tontine.onrender.com`.

### Activer les commandes (webhook)
Ouvre une fois dans le navigateur :
```
https://ma-tontine.onrender.com/set-webhook?key=TA_CLE&url=https://ma-tontine.onrender.com
```
→ tes commandes `/point`, `/motivation`, `/citation`, `/aide` répondent.

> ℹ️ Le free tier Render endort le service après ~15 min. Le cron (étape 5) le réveille pour les envois. Les commandes répondent quand le service est éveillé.

---

## 5. Programmer les 3 rappels/jour (cron externe gratuit)

Sur **cron-job.org** (gratuit), crée 3 jobs (fuseau Afrique/Abidjan) :

| Heure | URL à appeler |
|---|---|
| 08:00 | `https://ma-tontine.onrender.com/notify?key=TA_CLE&slot=matin` |
| 13:00 | `https://ma-tontine.onrender.com/notify?key=TA_CLE&slot=midi` |
| 20:00 | `https://ma-tontine.onrender.com/notify?key=TA_CLE&slot=soir` |

Tu veux **plus** de notifications ? Ajoute d'autres jobs (ex. 10:00, 16:00) — si tu ne passes pas `slot`, le bot choisit automatiquement selon l'heure.

### Variante GitHub Actions
`.github/workflows/tontine.yml` :
```yaml
name: Tontine Telegram
on:
  schedule:
    - cron: '0 8 * * *'
    - cron: '0 13 * * *'
    - cron: '0 20 * * *'
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          H=$(date -u +%H)
          SLOT=matin; [ "$H" -ge 11 ] && SLOT=midi; [ "$H" -ge 17 ] && SLOT=soir
          curl -s "https://ma-tontine.onrender.com/notify?key=${{ secrets.NOTIFY_KEY }}&slot=$SLOT"
```
(Abidjan = UTC+0, donc les heures UTC = tes heures locales.)

---

## 6. Personnaliser

- **Heures / nombre de rappels** : tes jobs cron (autant que tu veux).
- **Citations** : tableau `QUOTES` dans `bot.js`.
- **Motivations** : tableau `MOTI`.
- **Tons matin/midi/soir** : objets `INTRO` et `CLOSER`.
- **Dates / montant reçu / noms** : constantes en haut de `bot.js`.

## Commandes disponibles
`/start` · `/point` · `/motivation` · `/citation` · `/aide`

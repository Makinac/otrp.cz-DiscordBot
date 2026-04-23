# 🤠 Old Times RP — Discord Bot

Ticket systém + moderace pro Discord komunitu **Old Times RP**.

---

## ✨ Funkce

- **Ticket systém** se 4 kategoriemi (Admin / Dev / Faction / Vedení)
- Persistentní panel s tlačítky (přežije restart bota)
- Modaly pro vytvoření a uzavření ticketu
- HTML transcripty s western stylem
- Statistiky staffu (`/stats`)
- Auto-role při vstupu na server
- Blacklist zakázaných domén s moderačním logem
- Plná podpora PM2 / Docker / Pterodactyl

---

## 🚀 Instalace

### 1. Požadavky

- Node.js **≥ 20.0.0**
- npm nebo pnpm

### 2. Klonování a instalace závislostí

```bash
git clone <repo> otrp-bot
cd otrp-bot
npm install
```

### 3. Konfigurace `.env`

```bash
cp .env.example .env
nano .env
```

Vyplňte všechny hodnoty v `.env`:

| Proměnná | Popis |
|---|---|
| `DISCORD_BOT_TOKEN` | Token bota z Discord Developer Portal |
| `CLIENT_ID` | Application ID bota |
| `GUILD_ID` | ID Discord serveru |
| `VEDENI_ROLE_ID` | Role ID Vedení (sdílená s Laravelem) |
| `AL_ROLE_ID` | Role ID Admin/Lead |
| `CLEN_ROLE_ID` | Role automaticky přidělená novým členům |
| `ADMIN_STAFF_ROLES` | Role IDs pro Admin Ticket (čárkou) |
| `DEV_STAFF_ROLES` | Role IDs pro Dev Ticket (čárkou) |
| `FACTION_STAFF_ROLES` | Role IDs pro Faction Ticket (čárkou) |
| `VEDENI_STAFF_ROLES` | Role IDs pro Vedení Ticket (čárkou) |
| `TICKET_CATEGORY_ADMIN` | ID Discord kategorie pro Admin tickety |
| `TICKET_CATEGORY_DEV` | ID Discord kategorie pro Dev tickety |
| `TICKET_CATEGORY_FACTION` | ID Discord kategorie pro Faction tickety |
| `TICKET_CATEGORY_VEDENI` | ID Discord kategorie pro Vedení tickety |
| `TICKET_CLOSED_CATEGORY` | ID Discord kategorie pro uzavřené tickety |
| `TICKET_LOG_CHANNEL` | ID kanálu pro ticket logy |
| `TRANSCRIPT_CHANNEL` | ID kanálu pro transcript soubory |
| `MOD_LOG_CHANNEL` | ID kanálu pro moderační logy |

### 4. Registrace slash příkazů

```bash
npm run deploy
```

Tuto operaci proveďte vždy po přidání/změně příkazů. Registrace je guild-only (okamžitá, bez 1h čekání).

### 5. Spuštění

```bash
# Normální spuštění
npm start

# Development (automatický restart při změnách)
npm run dev
```

---

## 🤖 Oprávnění bota

Bot vyžaduje tato Discord oprávnění:

- `Manage Channels` – vytváření/přejmenování ticket kanálů
- `Manage Roles` – přidělování auto-role (Člen)
- `Manage Messages` – mazání zpráv s blacklistovanými odkazy
- `Send Messages`, `Embed Links`, `Attach Files` – odesílání embedů a transcriptů
- `Read Message History` – načítání zpráv pro transcript
- `View Channels` – viditelnost kanálů

**Privileged Gateway Intents** (zapnout v Developer Portalu):
- `SERVER MEMBERS INTENT` – pro auto-role event
- `MESSAGE CONTENT INTENT` – pro blacklist scanner

---

## 📁 Struktura projektu

```
Bot/
├── index.js              # Vstupní bod aplikace
├── config.js             # Konfigurace z .env
├── database.js           # SQLite databáze + prepared statements
├── deploy-commands.js    # Registrace slash příkazů u Discordu
├── .env.example          # Šablona konfigurace
├── package.json
│
├── commands/
│   ├── ticket.js         # /ticket setup | /ticket config *
│   ├── stats.js          # /stats [uživatel]
│   └── blacklist.js      # /blacklist add|remove|list
│
├── events/
│   ├── ready.js          # Bot ready event
│   ├── interactionCreate.js  # Routing interakcí
│   ├── messageCreate.js  # Blacklist scanner
│   └── guildMemberAdd.js # Auto-role
│
├── handlers/
│   ├── commandHandler.js # Načítání příkazů
│   ├── eventHandler.js   # Načítání eventů
│   ├── buttonHandler.js  # Zpracování tlačítek
│   └── modalHandler.js   # Zpracování modalů
│
├── utils/
│   ├── permissions.js    # Kontroly oprávnění
│   ├── embeds.js         # Embed buildery
│   ├── transcript.js     # HTML transcript generátor
│   ├── ticketUtils.js    # Logika ticketů (create/claim/close)
│   └── blacklistUtils.js # Blacklist kontroly
│
├── views/
│   ├── ticketPanel.js    # Panel pro vytváření ticketů
│   └── ticketControls.js # Tlačítka v ticket kanálu
│
├── data/
│   └── bot.db            # SQLite databáze (auto-vytvořena)
│
└── transcripts/          # HTML soubory transcriptů (auto-vytvořena)
```

---

## 💬 Slash příkazy

### Ticket systém

| Příkaz | Popis | Oprávnění |
|---|---|---|
| `/ticket setup [kanál]` | Vytvoří panel pro tickety | Vedení / AL |
| `/ticket config log <kanál>` | Nastaví log kanál | Vedení / AL |
| `/ticket config transcript <kanál>` | Nastaví transcript kanál | Vedení / AL |
| `/ticket config modlog <kanál>` | Nastaví mod-log kanál | Vedení / AL |
| `/ticket config staff-add <kategorie> <role>` | Přidá staff roli | Vedení / AL |
| `/ticket config staff-remove <kategorie> <role>` | Odebere staff roli | Vedení / AL |
| `/ticket config set-category <typ> <kategorie>` | Nastaví Discord složku | Vedení / AL |
| `/ticket config zobrazit` | Zobrazí aktuální konfiguraci | Vedení / AL |

### Statistiky

| Příkaz | Popis | Oprávnění |
|---|---|---|
| `/stats` | Vlastní statistiky | Všichni |
| `/stats <uživatel>` | Statistiky jiného uživatele | Vedení / AL |

### Blacklist

| Příkaz | Popis | Oprávnění |
|---|---|---|
| `/blacklist add <doména>` | Přidá doménu na blacklist | Staff |
| `/blacklist remove <doména>` | Odebere doménu z blacklistu | Staff |
| `/blacklist list` | Zobrazí blacklistované domény | Staff |

---

## ⚙️ Konfigurace bez restartu

Nastavení kanálů a rolí lze měnit za běhu pomocí `/ticket config` a `/blacklist` příkazů — bez nutnosti restartu nebo úpravy `.env`. Nastavení se ukládá do SQLite databáze.

---

## 🐳 Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "index.js"]
```

```bash
docker build -t otrp-bot .
docker run -d --name otrp-bot --env-file .env -v $(pwd)/data:/app/data -v $(pwd)/transcripts:/app/transcripts otrp-bot
```

---

## 🔄 PM2

```bash
npm install -g pm2
pm2 start index.js --name "otrp-bot"
pm2 save
pm2 startup
```

---

## 🦕 Pterodactyl

1. Použij **Nodejs Generic** egg
2. Nastav startovací příkaz: `node index.js`
3. Přidej všechny proměnné z `.env` jako environment variables v panelu
4. Nastav `data/` a `transcripts/` jako persistent volumes

---

## 📝 Databáze (SQLite)

| Tabulka | Popis |
|---|---|
| `tickets` | Záznamy všech ticketů |
| `staff_stats` | Statistiky staffu |
| `blacklisted_links` | Blacklistované domény |
| `config` | Runtime konfigurace (kanály, role) |
| `ticket_counter` | Čítač čísel ticketů |

Databázový soubor: `data/bot.db`

---

## 🆘 Řešení problémů

**Bot nevidí zprávy?**
→ Zapni `MESSAGE CONTENT INTENT` v Developer Portalu

**Auto-role nefunguje?**
→ Zapni `SERVER MEMBERS INTENT` + ověř, že bot má roli výše v hierarchii než přidělovaná role

**Příkazy se nezobrazují?**
→ Spusť `npm run deploy` znovu

**`Missing Permissions` chyba?**
→ Přesuň roli bota výše v Server Settings → Roles

---

*🤠 Old Times RP — Support Systém*

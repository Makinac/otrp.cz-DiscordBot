'use strict';
const { encode } = require('html-entities');
const fs     = require('fs');
const path   = require('path');
const moment = require('moment');
moment.locale('cs');

const TRANSCRIPTS_DIR = path.join(__dirname, '..', 'transcripts');

/**
 * Načte všechny zprávy z kanálu (stránkováno, max 5000 zpráv).
 * @param {import('discord.js').TextChannel} channel
 * @returns {Promise<import('discord.js').Message[]>}
 */
async function fetchAllMessages(channel) {
  const messages = [];
  let lastId = undefined;

  for (let i = 0; i < 50; i++) {          // max 50 * 100 = 5000 zpráv
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    messages.push(...batch.values());
    lastId = batch.last().id;

    if (batch.size < 100) break;
  }

  // Seřaď chronologicky (nejstarší první)
  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/**
 * Převede základní Discord markdown na HTML.
 * @param {string} text
 * @returns {string}
 */
function markdownToHtml(text) {
  if (!text) return '';
  let result = encode(text);

  // Kódové bloky (```lang\n...\n```)
  result = result.replace(/```(?:[a-z]*\n)?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline kód
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Tučný kurzíva
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Tučný
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Kurzíva
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // Podtržení
  result = result.replace(/__(.+?)__/g, '<u>$1</u>');
  // Přeškrtnutí
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Spoiler
  result = result.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>');
  // Zmínky (uživatelé)
  result = result.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@uživatel</span>');
  // Zmínky (role)
  result = result.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention role-mention">@role</span>');
  // Zmínky (kanály)
  result = result.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#kanál</span>');
  // Nové řádky
  result = result.replace(/\n/g, '<br>');

  return result;
}

/**
 * Vygeneruje HTML string embed bloku.
 * @param {import('discord.js').Embed} embed
 * @returns {string}
 */
function renderEmbed(embed) {
  const color  = embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#4f545c';
  const parts  = [];

  if (embed.title) {
    const titleHtml = embed.url
      ? `<a href="${encode(embed.url)}" target="_blank" rel="noopener noreferrer">${encode(embed.title)}</a>`
      : encode(embed.title);
    parts.push(`<div class="embed-title">${titleHtml}</div>`);
  }
  if (embed.description) {
    parts.push(`<div class="embed-description">${markdownToHtml(embed.description)}</div>`);
  }
  if (embed.fields && embed.fields.length > 0) {
    const fieldHtml = embed.fields.map(f =>
      `<div class="embed-field ${f.inline ? 'inline' : ''}">
        <div class="embed-field-name">${markdownToHtml(f.name)}</div>
        <div class="embed-field-value">${markdownToHtml(f.value)}</div>
      </div>`,
    ).join('');
    parts.push(`<div class="embed-fields">${fieldHtml}</div>`);
  }
  if (embed.image) {
    parts.push(`<div class="embed-image"><img src="${encode(embed.image.url)}" alt="embed image" loading="lazy"></div>`);
  }
  if (embed.footer) {
    parts.push(`<div class="embed-footer">${encode(embed.footer.text || '')}</div>`);
  }

  return `<div class="embed" style="border-left: 4px solid ${color};">${parts.join('')}</div>`;
}

/**
 * Vygeneruje HTML blok zprávy.
 * @param {import('discord.js').Message} msg
 * @returns {string}
 */
function renderMessage(msg) {
  const avatar    = msg.author.displayAvatarURL({ size: 64, extension: 'png' });
  const username  = encode(msg.author.username);
  const dispName  = encode(msg.member?.displayName || msg.author.username);
  const timestamp = moment(msg.createdAt).format('D. M. YYYY HH:mm:ss');
  const isBot     = msg.author.bot;
  const botBadge  = isBot ? '<span class="bot-badge">BOT</span>' : '';

  let contentHtml = markdownToHtml(msg.content);

  // Přílohy
  const attachments = [...msg.attachments.values()];
  const attHtml = attachments.map(att => {
    if (att.contentType?.startsWith('image/')) {
      return `<div class="attachment"><img src="${encode(att.url)}" alt="${encode(att.name)}" loading="lazy" class="attachment-img"></div>`;
    }
    return `<div class="attachment"><a href="${encode(att.url)}" target="_blank" rel="noopener noreferrer">📎 ${encode(att.name)}</a></div>`;
  }).join('');

  // Embedy
  const embedsHtml = msg.embeds.map(renderEmbed).join('');

  // Systémové zprávy
  if (msg.system) {
    return `<div class="message system-message">
      <div class="message-content system-content">⚙️ ${contentHtml || encode(msg.type)}</div>
    </div>`;
  }

  return `
  <div class="message ${isBot ? 'bot-message' : ''}">
    <img class="avatar" src="${avatar}" alt="${username}" loading="lazy">
    <div class="message-body">
      <div class="message-header">
        <span class="display-name">${dispName}</span>
        ${botBadge}
        <span class="username">@${username}</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      ${contentHtml ? `<div class="message-content">${contentHtml}</div>` : ''}
      ${attHtml}
      ${embedsHtml}
    </div>
  </div>`;
}

/**
 * Vygeneruje kompletní HTML transcript a uloží jako soubor.
 * @param {object}  ticket   – Záznam z DB
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').GuildMember|null} closedBy
 * @param {string}  closeReason
 * @returns {Promise<string>}  – Cesta k souboru
 */
async function generateTranscript(ticket, channel, closedBy, closeReason) {
  const messages = await fetchAllMessages(channel);
  const messagesHtml = messages.map(renderMessage).join('\n');

  const categoryLabels = {
    admin:   '🔴 Admin Ticket',
    dev:     '🔵 Dev Ticket',
    faction: '🟢 Faction Ticket',
    vedeni:  '👑 Vedení Ticket',
  };

  const ticketNum   = String(ticket.ticket_id).padStart(4, '0');
  const categoryStr = categoryLabels[ticket.category] || ticket.category;
  const closedByStr = closedBy
    ? encode(`${closedBy.user.username} (${closedBy.id})`)
    : 'Neznámý';
  const now = moment().format('D. M. YYYY HH:mm:ss');

  const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${ticketNum} – Old Times RP</title>
  <style>
    /* ── Reset & base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1a0d00;
      color: #d4b483;
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 0;
    }
    a { color: #c9a227; }
    a:hover { color: #f0c040; }
    code { font-family: 'Consolas', 'Courier New', monospace; }

    /* ── Header (wanted poster) ── */
    .ticket-header {
      background: linear-gradient(135deg, #2c1503 0%, #4a2800 50%, #2c1503 100%);
      border-bottom: 4px solid #c9a227;
      padding: 32px 40px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .ticket-header::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(0,0,0,0.05) 10px,
        rgba(0,0,0,0.05) 20px
      );
    }
    .header-badge {
      display: inline-block;
      font-size: 12px;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #c9a227;
      border: 1px solid #c9a227;
      padding: 4px 16px;
      margin-bottom: 12px;
    }
    .header-title {
      font-size: 48px;
      font-weight: 900;
      color: #f5e6c0;
      text-shadow: 3px 3px 0 #2c1503, -1px -1px 0 #2c1503;
      letter-spacing: 2px;
      margin-bottom: 4px;
    }
    .header-subtitle {
      font-size: 14px;
      color: #9a7840;
      letter-spacing: 6px;
      text-transform: uppercase;
    }
    .header-divider {
      margin: 20px auto;
      width: 60%;
      border: none;
      border-top: 2px solid #c9a227;
      opacity: 0.5;
    }

    /* ── Info tabulka ── */
    .ticket-info {
      background: #251200;
      border: 1px solid #5c3317;
      border-radius: 8px;
      margin: 24px 40px;
      padding: 20px 28px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .info-field { }
    .info-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #7a5a2a;
      margin-bottom: 4px;
    }
    .info-value {
      color: #e8c87a;
      font-size: 13px;
      font-weight: 600;
    }

    /* ── Zprávy ── */
    .messages-section {
      padding: 0 40px 40px;
    }
    .messages-title {
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #7a5a2a;
      border-bottom: 1px solid #3d2000;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .message {
      display: flex;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 2px;
      transition: background 0.1s;
    }
    .message:hover { background: rgba(92,51,23,0.2); }
    .message.bot-message { background: rgba(55,35,10,0.3); }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 2px solid #3d2000;
      object-fit: cover;
    }
    .message-body { flex: 1; min-width: 0; }
    .message-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }
    .display-name {
      font-weight: 700;
      color: #f5e6c0;
      font-size: 14px;
    }
    .username {
      font-size: 11px;
      color: #5a4020;
    }
    .timestamp {
      font-size: 11px;
      color: #5a4020;
      margin-left: auto;
    }
    .bot-badge {
      background: #5865f2;
      color: white;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: 0.5px;
    }
    .message-content {
      color: #d4b483;
      word-break: break-word;
    }
    .system-message {
      justify-content: center;
      padding: 6px 24px;
    }
    .system-content {
      color: #5a4020;
      font-style: italic;
      font-size: 12px;
    }

    /* ── Markdown ── */
    strong { color: #f5e6c0; }
    em     { color: #c4a473; }
    del    { opacity: 0.5; }
    pre {
      background: #150900;
      border: 1px solid #3d2000;
      border-radius: 4px;
      padding: 10px 14px;
      overflow-x: auto;
      margin: 6px 0;
      font-size: 12px;
    }
    code.inline-code {
      background: #150900;
      border: 1px solid #3d2000;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 85%;
    }
    .spoiler {
      background: #3d2000;
      color: #3d2000;
      border-radius: 3px;
      padding: 0 3px;
      cursor: pointer;
    }
    .spoiler:hover { color: #d4b483; }
    .mention {
      color: #c9a227;
      background: rgba(201,162,39,0.1);
      border-radius: 3px;
      padding: 0 3px;
    }
    .role-mention { color: #43b581; background: rgba(67,181,129,0.1); }

    /* ── Přílohy & embedy ── */
    .attachment { margin: 6px 0; }
    .attachment-img {
      max-width: 400px;
      max-height: 300px;
      border-radius: 4px;
      border: 1px solid #3d2000;
    }
    .embed {
      background: #1e0f00;
      border-radius: 0 4px 4px 0;
      padding: 10px 14px;
      margin: 6px 0;
      max-width: 520px;
    }
    .embed-title {
      font-weight: 700;
      color: #f5e6c0;
      margin-bottom: 6px;
    }
    .embed-description {
      color: #c4a473;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .embed-fields {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .embed-field { flex: 1 1 100%; }
    .embed-field.inline { flex: 1 1 calc(33% - 8px); min-width: 100px; }
    .embed-field-name {
      font-size: 11px;
      font-weight: 700;
      color: #f5e6c0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .embed-field-value { color: #c4a473; font-size: 12px; }
    .embed-image { margin-top: 8px; }
    .embed-image img { max-width: 100%; border-radius: 4px; }
    .embed-footer { font-size: 11px; color: #5a4020; margin-top: 8px; }

    /* ── Footer ── */
    .page-footer {
      background: #150900;
      border-top: 2px solid #3d2000;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #5a4020;
    }
    .page-footer strong { color: #9a7840; }
  </style>
</head>
<body>

<!-- HEADER – WANTED POSTER STYLE -->
<div class="ticket-header">
  <div class="header-badge">⭐ Old Times RP ⭐</div>
  <div class="header-title">TICKET #${ticketNum}</div>
  <div class="header-subtitle">Transcript archivu</div>
  <hr class="header-divider">
</div>

<!-- INFO TABULKA -->
<div class="ticket-info">
  <div class="info-field">
    <div class="info-label">🎟️ Číslo ticketu</div>
    <div class="info-value">#${ticketNum}</div>
  </div>
  <div class="info-field">
    <div class="info-label">📂 Kategorie</div>
    <div class="info-value">${encode(categoryStr)}</div>
  </div>
  <div class="info-field">
    <div class="info-label">📋 Předmět</div>
    <div class="info-value">${encode(ticket.subject || '–')}</div>
  </div>
  <div class="info-field">
    <div class="info-label">👤 Žadatel ID</div>
    <div class="info-value">${encode(ticket.user_id)}</div>
  </div>
  <div class="info-field">
    <div class="info-label">🕐 Vytvořen</div>
    <div class="info-value">${encode(moment(ticket.created_at).format('D. M. YYYY HH:mm:ss'))}</div>
  </div>
  <div class="info-field">
    <div class="info-label">🔒 Uzavřen</div>
    <div class="info-value">${encode(now)}</div>
  </div>
  <div class="info-field">
    <div class="info-label">🤠 Uzavřel</div>
    <div class="info-value">${closedByStr}</div>
  </div>
  <div class="info-field">
    <div class="info-label"> Počet zpráv</div>
    <div class="info-value">${messages.length}</div>
  </div>
</div>

<!-- ZPRÁVY -->
<div class="messages-section">
  <div class="messages-title">📜 Průběh konverzace</div>
  ${messagesHtml || '<p style="color:#5a4020;font-style:italic;">Žádné zprávy nebyly nalezeny.</p>'}
</div>

<!-- FOOTER -->
<div class="page-footer">
  Transcript vygenerován <strong>${encode(now)}</strong>
  &nbsp;|&nbsp;
  <strong>🤠 Old Times RP</strong>
  &nbsp;•&nbsp;
  Ticket #${ticketNum}
</div>

</body>
</html>`;

  // Ulož soubor
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  }
  const fileName = `ticket-${ticketNum}-${Date.now()}.html`;
  const filePath  = path.join(TRANSCRIPTS_DIR, fileName);
  fs.writeFileSync(filePath, html, 'utf8');

  return filePath;
}

module.exports = { generateTranscript };

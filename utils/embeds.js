'use strict';
const { EmbedBuilder } = require('discord.js');
const moment = require('moment');
moment.locale('cs');

// ── Barevná paleta ─────────────────────────────────────────────────────────────
const COLORS = {
  gold:   0xC9A227,
  brown:  0x5C3317,
  green:  0x2ECC71,
  orange: 0xE67E22,
  red:    0xE74C3C,
  gray:   0x95A5A6,
  blue:   0x3498DB,
  yellow: 0xF1C40F,
  dark:   0x2C1503,
};

const FOOTER_TEXT = '🤠 Old Times RP  •  Support Systém';
const FOOTER_DEFAULT = { text: FOOTER_TEXT };

// ── Override cache (loaded from DB at startup, refreshed periodically) ─────────
let _o = {};

/**
 * Set the embed overrides cache. Called from index.js on startup + interval.
 * Keys follow the pattern `embed_{type}_{prop}`, e.g. `embed_log_ticket_open_title`.
 */
function setEmbedOverrides(overrides) { _o = overrides || {}; }

/** Helper: get hex color from overrides, or fallback to numeric constant. */
function _color(key, fallback) {
  const hex = _o[key];
  return hex ? parseInt(hex, 16) : fallback;
}

/** Helper: get text from overrides, or fallback. */
function _text(key, fallback) {
  return _o[key] || fallback;
}

/** Formátování timestampu do českého formátu */
function fmtTime(dateStr) {
  return moment(dateStr).format('D. M. YYYY HH:mm:ss');
}

/** Emoji pro stav ticketu */
function statusEmoji(status) {
  return status === 'open' ? '🟢' : status === 'claimed' ? '🟡' : '🔴';
}

// ── Ticket panel embed ────────────────────────────────────────────────────────
const PANEL_EMBED_DEFAULTS = {
  title:       '🎫  OTRP  •  Tickets',
  description: '> Potřebuješ pomoc nebo chceš nahlásit problém?\n' +
               '> Vyber níže kategorii a otevři ticket.\n\n' +
               '🔵 **Admin** — Nahlášení Hráčů, Všeobecné problémy a dotazy, Žádosti o CK\n' +
               '🟠 **Dev** — Bugy, návrhy\n' +
               '🟣 **Faction** — Žádosti o frakce, Stížnosti na frakce\n' +
               '🔴 **Vedení** — Závažné věci přímo pro vedení\n' +
               '⭐ **Premium** — Pouze pro subscribery\n\n',
  color: '2B2D31',
};

/**
 * @param {{ title?: string, description?: string, color?: string }} [opts]
 */
function buildPanelEmbed(opts = {}) {
  const title       = opts.title       || PANEL_EMBED_DEFAULTS.title;
  const description = opts.description || PANEL_EMBED_DEFAULTS.description;
  const color       = opts.color ? parseInt(opts.color, 16) : parseInt(PANEL_EMBED_DEFAULTS.color, 16);
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);
}

// ── Ticket kontrolní embed (uvnitř ticket kanálu) ────────────────────────────
const WELCOME_EMBED_DEFAULTS = {
  title:       'TICKET #{id}',
  description: '**Vítej v ticketu!**\n\n' +
               'Napiš sem svůj problém nebo dotaz co nejpodrobněji.\n' +
               'Čím více informací uvedeš, tím rychleji ti dokážeme pomoci.\n\n' +
               '> ⏱️ Náš tým se ti bude věnovat — odpověď může trvat až **72 hodin**.',
  footer: '',
};

/**
 * @param {object} ticket
 * @param {object} categoryMeta
 * @param {string|null} claimerTag
 * @param {{ title?: string, description?: string, footer?: string }} [opts]
 */
function buildTicketControlEmbed(ticket, categoryMeta, claimerTag = null, opts = {}) {
  const idStr = String(ticket.ticket_id).padStart(4, '0');
  const rawTitle = opts.title || WELCOME_EMBED_DEFAULTS.title;
  const rawDesc  = opts.description || WELCOME_EMBED_DEFAULTS.description;
  const footer   = opts.footer || WELCOME_EMBED_DEFAULTS.footer;

  const title       = rawTitle.replace('{id}', idStr).replace('{category}', categoryMeta.label ?? '');
  const description = rawDesc
    .replace('{id}', idStr)
    .replace('{category}', categoryMeta.label ?? '')
    .replace('{user}', `<@${ticket.user_id}>`);

  const embed = new EmbedBuilder()
    .setColor(categoryMeta.color || COLORS.gold)
    .setTitle(`${categoryMeta.emoji}  ${title}`)
    .setDescription(description)
    .setTimestamp();

  if (footer) embed.setFooter({ text: footer });
  if (claimerTag) embed.addFields({ name: '🤠 Převzato', value: claimerTag, inline: true });

  return embed;
}

// ── Log embed (klírování, zavření, apod.) ─────────────────────────────────────
function buildLogEmbed(action, data) {
  const configs = {
    ticket_open:      { color: COLORS.green,  title: '🎟️  NOVÝ TICKET OTEVŘEN' },
    ticket_claim:     { color: COLORS.orange, title: '🤠  TICKET PŘEVZAT' },
    ticket_close:     { color: COLORS.red,    title: '⚰️  TICKET UZAVŘEN' },
    blacklist_add:    { color: COLORS.red,    title: '🚫  DOMÉNA PŘIDÁNA NA BLACKLIST' },
    blacklist_remove: { color: COLORS.green,  title: '✅  DOMÉNA ODEBRÁNA Z BLACKLISTU' },
    link_blocked:     { color: COLORS.red,    title: '🔫  ZAKÁZANÝ ODKAZ SMAZÁN' },
    autoRole:         { color: COLORS.green,  title: '🤠  NOVÝ ČLEN' },
    member_join:      { color: COLORS.green,  title: '📥  NOVÝ ČLEN' },
    member_leave:     { color: COLORS.gray,   title: '📤  ČLEN ODEŠEL' },
    mute_add:         { color: COLORS.orange, title: '🔇  HRÁČ UMLČEN' },
    mute_remove:      { color: COLORS.green,  title: '🔊  MUTE ODSTRANĚN' },
  };

  const def = configs[action] || { color: COLORS.gold, title: action };
  const prefix = `embed_log_${action}`;

  const embed = new EmbedBuilder()
    .setColor(_color(`${prefix}_color`, def.color))
    .setTitle(_text(`${prefix}_title`, def.title))
    .setTimestamp();

  if (data.fields)      embed.addFields(data.fields);
  if (data.description) embed.setDescription(data.description);

  const footer = _text(`${prefix}_footer`, '');
  if (footer) embed.setFooter({ text: footer });

  return embed;
}

// ── Stats embed ───────────────────────────────────────────────────────────────
function buildStatsEmbed(member, stats) {
  return new EmbedBuilder()
    .setColor(_color('embed_stats_color', COLORS.gold))
    .setTitle(_text('embed_stats_title', '📊  STATISTIKY STAFFU'))
    .setDescription(
      '```\n' +
      '╔══════════════════════════════╗\n' +
      `║  ${(member.displayName || 'Neznámý').slice(0, 28).padEnd(28, ' ')}  ║\n` +
      '╚══════════════════════════════╝\n' +
      '```',
    )
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '🎟️ Ticketů převzato',  value: String(stats?.tickets_claimed ?? 0), inline: true },
      { name: '✅ Ticketů uzavřeno',  value: String(stats?.tickets_closed  ?? 0), inline: true },
      {
        name: '🕐 Poslední aktivita',
        value: stats?.last_activity ? fmtTime(stats.last_activity) : '–',
        inline: false,
      },
    )
    .setTimestamp();
}

// ── Chybový embed ─────────────────────────────────────────────────────────────
function buildErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(_color('embed_error_color', COLORS.red))
    .setTitle(_text('embed_error_title', '❌  Chyba'))
    .setDescription(message);
}

// ── Úspěchový embed ───────────────────────────────────────────────────────────
function buildSuccessEmbed(message) {
  return new EmbedBuilder()
    .setColor(_color('embed_success_color', COLORS.green))
    .setTitle(_text('embed_success_title', '✅  Hotovo'))
    .setDescription(message);
}

// ── Mute embedy ───────────────────────────────────────────────────────────────
const MUTE_FOOTER_DEFAULT = '🤠 Old Times RP  •  Moderace';

function buildMuteResponseEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(_color('embed_mute_response_color', COLORS.orange))
    .setTitle(_text('embed_mute_response_title', '🔇 Mute udělen'))
    .addFields(
      { name: 'Uživatel',  value: data.userMention,  inline: true },
      { name: 'Trvání',    value: data.duration,      inline: true },
      { name: 'Vyprší',    value: data.expires,       inline: true },
      { name: 'Důvod',     value: data.reason,        inline: false },
      { name: 'Udělil',    value: data.issuer,        inline: true },
    )
    .setFooter({ text: _text('embed_mute_response_footer', MUTE_FOOTER_DEFAULT) })
    .setTimestamp();
  return embed;
}

function buildMuteModlogEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(_color('embed_mute_modlog_color', COLORS.orange))
    .setTitle(_text('embed_mute_modlog_title', '🔇 Hráč umlčen'))
    .addFields(
      { name: 'Uživatel',  value: data.userTag,    inline: true },
      { name: 'Trvání',    value: data.duration,    inline: true },
      { name: 'Vyprší',    value: data.expires,     inline: true },
      { name: 'Důvod',     value: data.reason,      inline: false },
      { name: 'Moderátor', value: data.moderator,   inline: true },
    )
    .setFooter({ text: _text('embed_mute_modlog_footer', MUTE_FOOTER_DEFAULT) })
    .setTimestamp();
  return embed;
}

function buildMuteDmEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(_color('embed_mute_dm_color', COLORS.orange))
    .setTitle(_text('embed_mute_dm_title', '🔇 Byl/a jsi umlčen/a'))
    .setDescription(_text('embed_mute_dm_description', `Byl/a jsi umlčen/a na serveru **Old Times RP**.`))
    .addFields(
      { name: 'Trvání', value: data.duration, inline: true },
      { name: 'Vyprší', value: data.expires,  inline: true },
      { name: 'Důvod',  value: data.reason,   inline: false },
    )
    .setFooter({ text: _text('embed_mute_dm_footer', MUTE_FOOTER_DEFAULT) })
    .setTimestamp();
  return embed;
}

function buildMuteUnmuteEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(_color('embed_mute_unmute_color', COLORS.green))
    .setTitle(_text('embed_mute_unmute_title', '🔊 Mute automaticky odstraněn'))
    .addFields({ name: 'Uživatel', value: data.userMention, inline: true })
    .setFooter({ text: _text('embed_mute_unmute_footer', MUTE_FOOTER_DEFAULT) })
    .setTimestamp();
  return embed;
}

// ── Blacklist list embed ──────────────────────────────────────────────────────
function buildBlacklistListEmbed(lines, page, totalPages, totalCount) {
  return new EmbedBuilder()
    .setColor(_color('embed_blacklist_color', COLORS.red))
    .setTitle(_text('embed_blacklist_title', '🚫  Blacklist Domén'))
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Celkem: ${totalCount} domén  •  Strana ${page}/${totalPages}` });
}

module.exports = {
  COLORS,
  FOOTER_DEFAULT,
  PANEL_EMBED_DEFAULTS,
  WELCOME_EMBED_DEFAULTS,
  setEmbedOverrides,
  fmtTime,
  statusEmoji,
  buildPanelEmbed,
  buildTicketControlEmbed,
  buildLogEmbed,
  buildStatsEmbed,
  buildErrorEmbed,
  buildSuccessEmbed,
  buildMuteResponseEmbed,
  buildMuteModlogEmbed,
  buildMuteDmEmbed,
  buildMuteUnmuteEmbed,
  buildBlacklistListEmbed,
};

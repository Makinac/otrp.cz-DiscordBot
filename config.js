'use strict';
require('dotenv').config();

/** Pomocná funkce – rozdělí string podle čárky a odfiltruje prázdné hodnoty */
function splitIds(envVar) {
  return (process.env[envVar] || '').split(',').map(s => s.trim()).filter(Boolean);
}

const config = {
  // ── Základní bot konfigurace ──────────────────────────────
  token:    process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId:  process.env.GUILD_ID,

  // ── Role IDs ──────────────────────────────────────────────
  roles: {
    clen: process.env.CLEN_ROLE_ID,
  },

  // ── Staff role IDs na kategorii ticketu ──────────────────
  ticketStaffRoles: {
    admin:   splitIds('ADMIN_STAFF_ROLES'),
    dev:     splitIds('DEV_STAFF_ROLES'),
    faction: splitIds('FACTION_STAFF_ROLES'),
    vedeni:  splitIds('VEDENI_STAFF_ROLES'),
    premium: splitIds('PREMIUM_STAFF_ROLES'),
  },

  // ── Role IDs prémiových členů / subscriberů ──────────────────────────
  // (hráč musí mít alespoň jednu z těchto rolí pro otevření Premium ticketu)
  premiumMemberRoles: splitIds('PREMIUM_MEMBER_ROLES'),

  // ── Discord Category channel IDs pro tickety ────────────
  ticketCategories: {
    admin:   process.env.TICKET_CATEGORY_ADMIN,
    dev:     process.env.TICKET_CATEGORY_DEV,
    faction: process.env.TICKET_CATEGORY_FACTION,
    vedeni:  process.env.TICKET_CATEGORY_VEDENI,
    premium: process.env.TICKET_CATEGORY_PREMIUM,
    closed:  process.env.TICKET_CLOSED_CATEGORY,
  },

  // ── Log kanály ─────────────────────────────────────────────
  channels: {
    ticketLog:  process.env.TICKET_LOG_CHANNEL,
    transcript: process.env.TRANSCRIPT_CHANNEL,
    modLog:     process.env.MOD_LOG_CHANNEL,
  },

  // ── Výchozí blacklist domén ────────────────────────────────
  defaultBlacklist: [
    // Dospělý obsah
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com',
    'onlyfans.com', 'sex.com', 'redtube.com', 'youporn.com',
    'tube8.com', 'livejasmin.com', 'chaturbate.com', 'cam4.com',
    'stripchat.com', 'bongacams.com', 'myfreecams.com',
    // IP grabbery / phishing trackery
    'grabify.link', 'iplogger.org', 'iplogger.com',
    'blasze.tk', 'ps3cfw.com', '2no.co', 'yip.su',
    'lovebird.guru', 'trk.li',
  ],

  // ── Lokalizace a téma ──────────────────────────────────────
  categories: {
    admin:   { label: 'Admin Ticket',           emoji: '🔵', color: 0x3498DB },
    dev:     { label: 'Dev Ticket',             emoji: '🟠', color: 0xE67E22 },
    faction: { label: 'Faction Ticket',         emoji: '🟣', color: 0x9B59B6 },
    vedeni:  { label: 'Vedení Ticket',          emoji: '🔴', color: 0xE74C3C },
    premium: { label: 'Premium Ticket', emoji: '⭐', color: 0xF1C40F },
  },
};

module.exports = config;

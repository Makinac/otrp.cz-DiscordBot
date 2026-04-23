'use strict';
const mysql = require('mysql2/promise');

let pool;

// ── Inicializace databáze ──────────────────────────────────────────────────────
async function initDatabase() {
  pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'discord_bot',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  });

  // Vytvoření tabulek
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tickets (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id    VARCHAR(50)  UNIQUE NOT NULL,
      channel_id   VARCHAR(50),
      user_id      VARCHAR(50)  NOT NULL,
      username     VARCHAR(100),
      category     VARCHAR(50)  NOT NULL,
      subject      VARCHAR(255),
      description  TEXT,
      claimed_by   VARCHAR(50),
      claimed_at   VARCHAR(50),
      status       VARCHAR(20)  NOT NULL DEFAULT 'open',
      created_at   VARCHAR(50)  NOT NULL,
      closed_at    VARCHAR(50),
      close_reason TEXT,
      closed_by    VARCHAR(50)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS staff_stats (
      user_id         VARCHAR(50) PRIMARY KEY,
      username        VARCHAR(100),
      tickets_claimed INT NOT NULL DEFAULT 0,
      tickets_closed  INT NOT NULL DEFAULT 0,
      last_activity   VARCHAR(50)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS blacklisted_links (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      domain    VARCHAR(253) UNIQUE NOT NULL,
      added_by  VARCHAR(100),
      added_at  VARCHAR(50) NOT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS config (
      \`key\`   VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ticket_counter (
      id      INT PRIMARY KEY,
      counter INT NOT NULL DEFAULT 0
    )
  `);

  // Inicializace čítače (pokud neexistuje)
  const [rows] = await pool.execute('SELECT id FROM ticket_counter WHERE id = 1');
  if (rows.length === 0) {
    await pool.execute('INSERT INTO ticket_counter (id, counter) VALUES (1, 0)');
  }

  console.log('[DATABASE] MySQL připojen a tabulky inicializovány.');
}

// ── Prepared statements (async wrappery) ───────────────────────────────────────
const stmts = {
  // Tickety
  createTicket: {
    async run(data) {
      await pool.execute(
        'INSERT INTO tickets (ticket_id, channel_id, user_id, username, category, subject, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [data.ticket_id, data.channel_id, data.user_id, data.username, data.category, data.subject, data.description, 'open', data.created_at],
      );
    },
  },
  getTicket: {
    async get(ticketId) {
      const [rows] = await pool.execute('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
      return rows[0] || null;
    },
  },
  getTicketByChannel: {
    async get(channelId) {
      const [rows] = await pool.execute('SELECT * FROM tickets WHERE channel_id = ?', [channelId]);
      return rows[0] || null;
    },
  },
  claimTicket: {
    async run(claimedBy, claimedAt, ticketId) {
      await pool.execute('UPDATE tickets SET claimed_by = ?, claimed_at = ? WHERE ticket_id = ?', [claimedBy, claimedAt, ticketId]);
    },
  },
  closeTicket: {
    async run(closedAt, closeReason, closedBy, ticketId) {
      await pool.execute(
        "UPDATE tickets SET status = 'closed', closed_at = ?, close_reason = ?, closed_by = ? WHERE ticket_id = ?",
        [closedAt, closeReason, closedBy, ticketId],
      );
    },
  },
  updateChannelId: {
    async run(channelId, ticketId) {
      await pool.execute('UPDATE tickets SET channel_id = ? WHERE ticket_id = ?', [channelId, ticketId]);
    },
  },
  getOpenTicketByUser: {
    async get(userId, category) {
      const [rows] = await pool.execute("SELECT * FROM tickets WHERE user_id = ? AND status = 'open' AND category = ?", [userId, category]);
      return rows[0] || null;
    },
  },
  countOpenTicketsByCategory: {
    async get(category) {
      const [rows] = await pool.execute("SELECT COUNT(*) as count FROM tickets WHERE category = ? AND status = 'open'", [category]);
      return rows[0];
    },
  },

  // Čítač čísel ticketů
  incrementCounter: {
    async run() {
      await pool.execute('UPDATE ticket_counter SET counter = counter + 1 WHERE id = 1');
    },
  },
  getCounter: {
    async get() {
      const [rows] = await pool.execute('SELECT counter FROM ticket_counter WHERE id = 1');
      return rows[0];
    },
  },

  // Statistiky staffu
  getStats: {
    async get(userId) {
      const [rows] = await pool.execute('SELECT * FROM staff_stats WHERE user_id = ?', [userId]);
      return rows[0] || null;
    },
  },
  getTopStats: {
    async all() {
      const [rows] = await pool.execute('SELECT * FROM staff_stats ORDER BY tickets_closed DESC LIMIT 10');
      return rows;
    },
  },
  upsertStats: {
    async run(data) {
      await pool.execute(
        `INSERT INTO staff_stats (user_id, username, tickets_claimed, tickets_closed, last_activity)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           username        = VALUES(username),
           tickets_claimed = tickets_claimed + VALUES(tickets_claimed),
           tickets_closed  = tickets_closed  + VALUES(tickets_closed),
           last_activity   = VALUES(last_activity)`,
        [data.user_id, data.username, data.tickets_claimed, data.tickets_closed, data.last_activity],
      );
    },
  },

  // Blacklist
  addBlacklist: {
    async run(domain, addedBy, addedAt) {
      const [result] = await pool.execute('INSERT IGNORE INTO blacklisted_links (domain, added_by, added_at) VALUES (?, ?, ?)', [domain, addedBy, addedAt]);
      return { changes: result.affectedRows };
    },
  },
  removeBlacklist: {
    async run(domain) {
      const [result] = await pool.execute('DELETE FROM blacklisted_links WHERE domain = ?', [domain]);
      return { changes: result.affectedRows };
    },
  },
  getBlacklist: {
    async all() {
      const [rows] = await pool.execute('SELECT * FROM blacklisted_links ORDER BY added_at DESC');
      return rows;
    },
  },
  isBlacklisted: {
    async get(domain) {
      const [rows] = await pool.execute('SELECT 1 FROM blacklisted_links WHERE domain = ?', [domain]);
      return rows[0] || null;
    },
  },

  // Konfigurace
  getConfig: {
    async get(key) {
      const [rows] = await pool.execute('SELECT value FROM config WHERE `key` = ?', [key]);
      return rows[0] || null;
    },
  },
  setConfig: {
    async run(key, value) {
      await pool.execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', [key, value]);
    },
  },
  getAllConfig: {
    async all() {
      const [rows] = await pool.execute('SELECT * FROM config');
      return rows;
    },
  },
};

// ── Pomocné funkce ────────────────────────────────────────────────────────────

/** Vrátí hodnotu z config tabulky, nebo defaultní hodnotu */
async function getConfig(key, defaultValue = null) {
  const row = await stmts.getConfig.get(key);
  return row ? row.value : defaultValue;
}

/** Uloží hodnotu do config tabulky */
async function setConfig(key, value) {
  await stmts.setConfig.run(key, String(value));
}

/** Výchozí kategorie ticketů (fallback pokud DB ještě nemá ticket_categories) */
const DEFAULT_CATEGORIES = [
  { slug: 'admin',   label: 'Admin Ticket',   emoji: '🔵', color: '3498DB' },
  { slug: 'dev',     label: 'Dev Ticket',     emoji: '🟠', color: 'E67E22' },
  { slug: 'faction', label: 'Faction Ticket', emoji: '🟣', color: '9B59B6' },
  { slug: 'vedeni',  label: 'Vedení Ticket',  emoji: '🔴', color: 'E74C3C' },
  { slug: 'premium', label: 'Premium Ticket', emoji: '⭐', color: 'F1C40F' },
];

/**
 * Vrátí seznam kategorií ticketů z DB.
 * Fallback na DEFAULT_CATEGORIES pokud DB záznam chybí nebo je neplatný.
 * @returns {Promise<Array<{slug:string,label:string,emoji:string,color:string}>>}
 */
async function getCategories() {
  const raw = await getConfig('ticket_categories');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return DEFAULT_CATEGORIES;
}

/**
 * Uloží seznam kategorií ticketů do DB.
 * @param {Array<{slug:string,label:string,emoji:string,color:string}>} cats
 */
async function saveCategories(cats) {
  await setConfig('ticket_categories', JSON.stringify(cats));
}

/** Výchozí kategorie ticketů (fallback pokud DB ještě nemá ticket_categories) */

/** Vrátí a inkrementuje číslo dalšího ticketu */
async function getNextTicketNumber() {
  await stmts.incrementCounter.run();
  const row = await stmts.getCounter.get();
  return row.counter;
}

module.exports = { pool, stmts, getConfig, setConfig, getCategories, saveCategories, getNextTicketNumber, initDatabase };

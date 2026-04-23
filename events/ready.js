'use strict';
const { initBlacklist }  = require('../utils/blacklistUtils');
const { updateStats }    = require('../utils/statsUpdater');

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    console.log(`[BOT] ✅ Přihlášen jako ${client.user.tag}`);
    console.log(`[BOT] Spravuji ${client.guilds.cache.size} server(ů), ${client.users.cache.size} uživatelů.`);

    // ── Cache pozvánek pro invite tracking ─────────────────────
    client.inviteCache = new Map();
    for (const guild of client.guilds.cache.values()) {
      try {
        const invites = await guild.invites.fetch();
        client.inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses])));
      } catch (err) {
        console.warn(`[INVITE] Nepodařilo se načíst pozvánky pro ${guild.name}:`, err.message);
      }
    }
    console.log('[INVITE] Cache pozvánek načtena.');

    // Inicializace výchozího blacklistu
    try {
      await initBlacklist();
    } catch (err) {
      console.error('[BOT] Chyba při inicializaci blacklistu:', err);
    }

    // Stats kanály – první update + každých 10 minut
    await updateStats(client).catch(err => console.error('[STATS] Chyba:', err));
    setInterval(() => updateStats(client).catch(err => console.error('[STATS] Chyba:', err)), 10 * 60 * 1000);

    console.log('[BOT] 🌵 Old Times RP bot je připraven!');
  },
};

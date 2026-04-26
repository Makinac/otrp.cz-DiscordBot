'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const config  = require('./config');
const { initDatabase, getConfig } = require('./database');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents }   = require('./handlers/eventHandler');
const { setEmbedOverrides } = require('./utils/embeds');

// ── Discord Client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
  ],
});

// ── Připojení config a commandů ke klientovi ─────────────────────────────────
client.config   = config;
client.commands = new Collection();

// ── Ujisti se, že složka transcripts existuje ────────────────────────────────
const transcriptsDir = path.join(__dirname, 'transcripts');
if (!fs.existsSync(transcriptsDir)) fs.mkdirSync(transcriptsDir, { recursive: true });

// ── Načtení commandů a eventů ─────────────────────────────────────────────────
loadCommands(client);
loadEvents(client);

// ── Inicializace databáze a přihlášení ────────────────────────────────────────
(async () => {
  try {
    await initDatabase();
    await refreshEmbedConfig();
    await client.login(config.token);

    // Refresh embed overrides from DB every 5 minutes
    setInterval(refreshEmbedConfig, 5 * 60 * 1000);
  } catch (err) {
    console.error('[FATAL] Spuštění selhalo:', err.message);
    process.exit(1);
  }
})();

/** Load all embed_* config keys from the bot DB and feed them into the cache. */
async function refreshEmbedConfig() {
  try {
    const keys = [
      // Log embeds (per action type)
      'embed_log_ticket_open_title', 'embed_log_ticket_open_color',
      'embed_log_ticket_claim_title', 'embed_log_ticket_claim_color',
      'embed_log_ticket_close_title', 'embed_log_ticket_close_color',
      'embed_log_blacklist_add_title', 'embed_log_blacklist_add_color',
      'embed_log_blacklist_remove_title', 'embed_log_blacklist_remove_color',
      'embed_log_link_blocked_title', 'embed_log_link_blocked_color',
      'embed_log_autoRole_title', 'embed_log_autoRole_color',
      'embed_log_mute_add_title', 'embed_log_mute_add_color',
      'embed_log_mute_remove_title', 'embed_log_mute_remove_color',
      // Mute embeds
      'embed_mute_response_title', 'embed_mute_response_color', 'embed_mute_response_footer',
      'embed_mute_modlog_title', 'embed_mute_modlog_color', 'embed_mute_modlog_footer',
      'embed_mute_dm_title', 'embed_mute_dm_color', 'embed_mute_dm_description', 'embed_mute_dm_footer',
      'embed_mute_unmute_title', 'embed_mute_unmute_color', 'embed_mute_unmute_footer',
      // System embeds
      'embed_error_title', 'embed_error_color',
      'embed_success_title', 'embed_success_color',
      // Other embeds
      'embed_stats_title', 'embed_stats_color',
      'embed_blacklist_title', 'embed_blacklist_color',
      // Voice & message log embeds
      'embed_log_voice_join_title', 'embed_log_voice_join_color',
      'embed_log_voice_leave_title', 'embed_log_voice_leave_color',
      'embed_log_voice_move_title', 'embed_log_voice_move_color',
      'embed_log_message_delete_title', 'embed_log_message_delete_color',
      'embed_log_message_edit_title', 'embed_log_message_edit_color',
    ];
    const overrides = {};
    for (const key of keys) {
      const val = await getConfig(key);
      if (val) overrides[key] = val;
    }
    setEmbedOverrides(overrides);
  } catch (e) {
    console.error('[WARN] Failed to load embed config:', e.message);
  }
}

// ── Globální error handling ───────────────────────────────────────────────────
process.on('unhandledRejection', err => console.error('[ERROR] Unhandled Rejection:', err));
process.on('uncaughtException',  err => console.error('[ERROR] Uncaught Exception:', err));

module.exports = client;

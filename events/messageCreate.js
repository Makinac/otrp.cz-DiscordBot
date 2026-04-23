'use strict';
const { Events, EmbedBuilder } = require('discord.js');
const moment = require('moment');

const { checkBlacklist }  = require('../utils/blacklistUtils');
const { buildLogEmbed }   = require('../utils/embeds');
const config              = require('../config');
const { getConfig, stmts } = require('../database');

let muteRoleCache = { value: null, expiresAt: 0 };

async function getCachedMuteRoleId() {
  const now = Date.now();
  if (muteRoleCache.expiresAt > now) return muteRoleCache.value;

  const roleId = await getConfig('mute_role_id');
  muteRoleCache = {
    value: roleId || null,
    expiresAt: now + 60_000,
  };
  return muteRoleCache.value;
}

module.exports = {
  name: Events.MessageCreate,
  once: false,

  async execute(message, client) {
    // Ignoruj boty a DM zprávy
    if (message.author.bot || !message.guild) return;

    // ── Mute enforcement: mimo tickety nesmí psát ─────────────────────
    const muteRoleId = await getCachedMuteRoleId();
    const isMuted = Boolean(
      muteRoleId
      && message.member
      && message.member.roles
      && message.member.roles.cache.has(muteRoleId),
    );

    if (isMuted) {
      const ticketRow = await stmts.getTicketByChannel.get(message.channel.id);
      const isTicketChannel = Boolean(ticketRow);

      if (!isTicketChannel) {
        try {
          await message.delete();
        } catch {
          console.warn(`[MUTE] Nelze smazat zprávu od ${message.author.tag}`);
        }

        try {
          const warn = await message.channel.send({
            content: `🔇 <@${message.author.id}> Jsi mutenutý/á a můžeš psát pouze v ticket kanálu.`,
          });
          setTimeout(() => warn.delete().catch(() => {}), 8_000);
        } catch {
          // Ignore if bot cannot post in this channel
        }

        return;
      }
    }

    // ── Kontrola blacklistovaných odkazů ──────────────────────────
    const blockedDomain = await checkBlacklist(message.content);
    if (!blockedDomain) return;

    // Smaž zprávu
    try {
      await message.delete();
    } catch {
      // Oprávnění nestačí – loguj ale pokračuj
      console.warn(`[BLACKLIST] Nelze smazat zprávu od ${message.author.tag}`);
    }

    // Varování uživateli (ephemeral není možný mimo interakce, pošleme do kanálu s auto-delete)
    try {
      const warn = await message.channel.send({
        content: `⚠️ <@${message.author.id}> Tvoje zpráva byla smazána, protože obsahovala zakázaný odkaz.`,
      });
      setTimeout(() => warn.delete().catch(() => {}), 8_000);
    } catch { /* Kanál není dostupný */ }

    // ── Log do moderačního log kanálu ─────────────────────────────
    const modLogId = await getConfig('mod_log_channel') || config.channels.modLog;
    if (!modLogId) return;

    const logChannel = message.guild.channels.cache.get(modLogId);
    if (!logChannel) return;

    try {
      await logChannel.send({
        embeds: [
          buildLogEmbed('link_blocked', {
            fields: [
              { name: '👤 Uživatel',   value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
              { name: '📺 Kanál',      value: `<#${message.channel.id}>`,                        inline: true },
              { name: '🚫 Doména',     value: `\`${blockedDomain}\``,                             inline: true },
              { name: '💬 Zpráva',     value: message.content.slice(0, 400) || '–',               inline: false },
              { name: '🕐 Čas',        value: moment().format('D. M. YYYY HH:mm:ss'),            inline: true },
            ],
          }),
        ],
      });
    } catch (err) {
      console.error('[BLACKLIST] Chyba při logování:', err);
    }
  },
};

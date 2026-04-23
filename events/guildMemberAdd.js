'use strict';
const { Events } = require('discord.js');
const moment     = require('moment');

const config             = require('../config');
const { getConfig }      = require('../database');
const { buildLogEmbed }  = require('../utils/embeds');

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member, client) {
    const guild = member.guild;

    // ── Invite tracking – zjisti kdo ho pozval ───────────────────
    let inviterText = '–';
    try {
      const cachedInvites = client.inviteCache?.get(guild.id) ?? new Map();
      const currentInvites = await guild.invites.fetch();

      // Najdi pozvánku, jejíž počet uses se zvýšil
      const usedInvite = currentInvites.find(inv => {
        const cached = cachedInvites.get(inv.code);
        return cached !== undefined && inv.uses > cached;
      });

      // Aktualizuj cache
      client.inviteCache.set(guild.id, new Map(currentInvites.map(inv => [inv.code, inv.uses])));

      if (usedInvite?.inviter) {
        inviterText = `<@${usedInvite.inviter.id}> (${usedInvite.inviter.tag})\n\`${usedInvite.code}\``;
      } else if (usedInvite) {
        inviterText = `\`${usedInvite.code}\` (pozyvatel neznámý)`;
      }
    } catch (err) {
      console.warn('[INVITE] Nepodařilo se zjistit pozvatele:', err.message);
    }

    // ── Auto-role: přidej roli "Člen" ────────────────────────────
    const clenRoleId = await getConfig('clen_role_id') || config.roles.clen;

    if (clenRoleId) {
      const role = guild.roles.cache.get(clenRoleId);
      if (role) {
        try {
          await member.roles.add(role, 'Auto-role při vstupu na server');
          console.log(`[AUTOROLE] Přidáno ${role.name} uživateli ${member.user.tag}`);
        } catch (err) {
          console.error(`[AUTOROLE] Nepodařilo se přidat roli ${member.user.tag}:`, err.message);
        }
      } else {
        console.warn(`[AUTOROLE] Role ID ${clenRoleId} nebyla nalezena na serveru.`);
      }
    }

    // ── Log do mod-log kanálu ────────────────────────────────────
    const modLogId = await getConfig('mod_log_channel') || config.channels.modLog;
    if (!modLogId) return;

    const logChannel = guild.channels.cache.get(modLogId);
    if (!logChannel) return;

    try {
      await logChannel.send({
        embeds: [
          buildLogEmbed('member_join', {
            fields: [
              { name: '👤 Uživatel',       value: `<@${member.id}> (${member.user.tag})`, inline: true },
              { name: 'ID',                value: member.id,                               inline: true },
              { name: '📅 Účet vytvořen',  value: moment(member.user.createdAt).format('D. M. YYYY'), inline: true },
              { name: '📨 Pozván od',      value: inviterText,                             inline: true },
              { name: '🤠 Role přidělena', value: clenRoleId ? `<@&${clenRoleId}>` : '–', inline: true },
              { name: '📊 Počet členů',    value: String(guild.memberCount),              inline: true },
              { name: '🕐 Vstoupil',       value: moment().format('D. M. YYYY HH:mm:ss'), inline: true },
            ],
          }),
        ],
      });
    } catch (err) {
      console.error('[AUTOROLE] Chyba při logování:', err);
    }
  },
};

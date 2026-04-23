'use strict';
const { Events } = require('discord.js');
const moment     = require('moment');

const config            = require('../config');
const { getConfig }     = require('../database');
const { buildLogEmbed } = require('../utils/embeds');

module.exports = {
  name: Events.GuildMemberRemove,
  once: false,

  async execute(member, client) {
    const guild = member.guild;

    // ── Log do mod-log kanálu ────────────────────────────────────
    const modLogId = await getConfig('mod_log_channel') || config.channels.modLog;
    if (!modLogId) return;

    const logChannel = guild.channels.cache.get(modLogId);
    if (!logChannel) return;

    // Sesbírej role (přeskoč @everyone)
    const roles = member.roles.cache
      .filter(r => r.id !== guild.id)
      .map(r => `<@&${r.id}>`)
      .join(', ') || '–';

    try {
      await logChannel.send({
        embeds: [
          buildLogEmbed('member_leave', {
            fields: [
              { name: '👤 Uživatel',      value: `<@${member.id}> (${member.user.tag})`, inline: true },
              { name: 'ID',               value: member.id,                               inline: true },
              { name: '📅 Účet vytvořen', value: moment(member.user.createdAt).format('D. M. YYYY'), inline: true },
              { name: '🚪 Odešel',        value: moment().format('D. M. YYYY HH:mm:ss'), inline: true },
              { name: '📊 Počet členů',   value: String(guild.memberCount),              inline: true },
              { name: '🏷️ Role',          value: roles,                                  inline: false },
            ],
          }),
        ],
      });
    } catch (err) {
      console.error('[LEAVE] Chyba při logování odchodu:', err);
    }
  },
};

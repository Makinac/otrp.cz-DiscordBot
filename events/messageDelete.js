'use strict';
const { Events } = require('discord.js');
const moment     = require('moment');

const config            = require('../config');
const { getConfig }     = require('../database');
const { buildLogEmbed } = require('../utils/embeds');

module.exports = {
  name: Events.MessageDelete,
  once: false,

  async execute(message, client) {
    // Ignoruj boty a DM
    if (message.author?.bot) return;
    if (!message.guild) return;

    const channelId = await getConfig('message_log_channel') || config.channels.messageLog;
    if (!channelId) return;

    const logChannel = message.guild.channels.cache.get(channelId);
    if (!logChannel) return;

    const author  = message.author ? `<@${message.author.id}> (${message.author.tag})` : '–';
    const authorId = message.author?.id ?? '–';
    const rawContent = message.content?.slice(0, 1018);
    const content = rawContent ? `\`\`\`${rawContent}\`\`\`` : '*[obsah nedostupný nebo prázdný]*';

    try {
      await logChannel.send({
        embeds: [
          buildLogEmbed('message_delete', {
            fields: [
              { name: '👤 Autor',    value: author,                     inline: true },
              { name: 'ID',          value: authorId,                   inline: true },
              { name: '📍 Kanál',    value: `<#${message.channelId}>`,  inline: true },
              { name: '🕐 Smazáno', value: moment().format('D. M. YYYY HH:mm:ss'), inline: true },
              { name: '📝 Obsah zprávy', value: content,                inline: false },
            ],
          }),
        ],
      });
    } catch (err) {
      console.error('[MSG-DELETE-LOG] Chyba při logování:', err);
    }
  },
};

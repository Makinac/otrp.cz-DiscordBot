'use strict';
const { Events } = require('discord.js');
const moment     = require('moment');

const config            = require('../config');
const { getConfig }     = require('../database');
const { buildLogEmbed } = require('../utils/embeds');

module.exports = {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage, client) {
    // Ignoruj boty a DM
    if (newMessage.author?.bot) return;
    if (!newMessage.guild) return;

    // Discord posílá update i pro embed load – ignoruj pokud se obsah nezměnil
    if (oldMessage.content === newMessage.content) return;

    const channelId = await getConfig('message_log_channel') || config.channels.messageLog;
    if (!channelId) return;

    const logChannel = newMessage.guild.channels.cache.get(channelId);
    if (!logChannel) return;

    const author   = newMessage.author ? `<@${newMessage.author.id}> (${newMessage.author.tag})` : '–';
    const authorId = newMessage.author?.id ?? '–';
    const rawBefore = oldMessage.content?.slice(0, 1018);
    const rawAfter  = newMessage.content?.slice(0, 1018);
    const before    = rawBefore ? `\`\`\`${rawBefore}\`\`\`` : '*[obsah nedostupný]*';
    const after     = rawAfter  ? `\`\`\`${rawAfter}\`\`\``  : '*[prázdná zpráva]*';

    try {
      await logChannel.send({
        embeds: [
          buildLogEmbed('message_edit', {
            fields: [
              { name: '👤 Autor',       value: author,                                    inline: true },
              { name: 'ID',             value: authorId,                                  inline: true },
              { name: '📍 Kanál',       value: `<#${newMessage.channelId}>`,              inline: true },
              { name: '🕐 Upraveno',    value: moment().format('D. M. YYYY HH:mm:ss'),   inline: true },
              { name: '📝 Před úpravou', value: before,                                   inline: false },
              { name: '✏️ Po úpravě',   value: after,                                    inline: false },
            ],
          }),
        ],
      });
    } catch (err) {
      console.error('[MSG-EDIT-LOG] Chyba při logování:', err);
    }
  },
};

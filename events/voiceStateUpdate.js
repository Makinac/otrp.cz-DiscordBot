'use strict';
const { Events } = require('discord.js');
const moment     = require('moment');

const config            = require('../config');
const { getConfig }     = require('../database');
const { buildLogEmbed } = require('../utils/embeds');

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,

  async execute(oldState, newState, client) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const guild = newState.guild ?? oldState.guild;

    const channelId = await getConfig('voice_log_channel') || config.channels.voiceLog;
    if (!channelId) return;

    const logChannel = guild.channels.cache.get(channelId);
    if (!logChannel) return;

    const userField = `<@${member.id}> (${member.user.tag})`;
    const time      = moment().format('D. M. YYYY HH:mm:ss');

    let action, fields;

    if (!oldState.channelId && newState.channelId) {
      // Připojení
      action = 'voice_join';
      fields = [
        { name: '👤 Uživatel',  value: userField,                               inline: true },
        { name: 'ID',           value: member.id,                               inline: true },
        { name: '🎙️ Kanál',    value: `<#${newState.channelId}>`,              inline: true },
        { name: '🕐 Čas',       value: time,                                    inline: true },
      ];
    } else if (oldState.channelId && !newState.channelId) {
      // Odpojení
      action = 'voice_leave';
      fields = [
        { name: '👤 Uživatel',  value: userField,                               inline: true },
        { name: 'ID',           value: member.id,                               inline: true },
        { name: '🎙️ Kanál',    value: `<#${oldState.channelId}>`,              inline: true },
        { name: '🕐 Čas',       value: time,                                    inline: true },
      ];
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      // Přesun mezi kanály
      action = 'voice_move';
      fields = [
        { name: '👤 Uživatel',  value: userField,                               inline: true },
        { name: 'ID',           value: member.id,                               inline: true },
        { name: '📤 Z kanálu',  value: `<#${oldState.channelId}>`,              inline: true },
        { name: '📥 Do kanálu', value: `<#${newState.channelId}>`,              inline: true },
        { name: '🕐 Čas',       value: time,                                    inline: true },
      ];
    } else {
      return; // Mute/deaf změny – ignorujeme
    }

    try {
      await logChannel.send({ embeds: [buildLogEmbed(action, { fields })] });
    } catch (err) {
      console.error('[VOICE-LOG] Chyba při logování:', err);
    }
  },
};

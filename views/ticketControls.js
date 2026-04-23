'use strict';
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

function buildTicketControls(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel('Zavřít ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}

module.exports = { buildTicketControls };

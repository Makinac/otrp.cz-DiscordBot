'use strict';
const { createTicket, closeTicket } = require('../utils/ticketUtils');
const { handleConfigModal }         = require('../commands/ticket');
const { handleStatsModal }          = require('../commands/serverstats');

/**
 * Zpracuje odeslání modalu.
 * customId formát: 'action:subaction:param'
 *   – ticket:create:admin|dev|faction|vedeni  → vytvoří ticket
 *   – ticket:close:ticketId                   → uzavře ticket
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleModal(interaction) {
  const parts     = interaction.customId.split(':');
  const action    = parts[0];
  const subaction = parts[1];
  const param     = parts[2];

  // ── Config modaly ─────────────────────────────────────────
  if (action === 'cfg_modal') return handleConfigModal(interaction);
  if (action === 'ss_modal')  return handleStatsModal(interaction);

  if (action !== 'ticket') return;

  switch (subaction) {
    case 'create': {
      const subject     = interaction.fields.getTextInputValue('subject');
      const description = interaction.fields.getTextInputValue('description');
      await createTicket(interaction, param, subject, description);
      break;
    }

    case 'close': {
      await closeTicket(interaction, param);
      break;
    }

    default:
      await interaction.reply({ content: '❌ Neznámá modal akce.', flags: 64 });
  }
}

module.exports = { handleModal };

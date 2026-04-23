'use strict';
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { closeTicket, createTicket } = require('../utils/ticketUtils');
const config                       = require('../config');
const { handleConfigButton }       = require('../commands/ticket');
const { handleStatsButton }        = require('../commands/serverstats');
const { getCategories, getConfig } = require('../database');

/**
 * Zpracuje kliknutí na tlačítko nebo výběr z dropdown menu.
 * customId formát: 'action:subaction:param'
 *   – ticket:select            (StringSelectMenu) → zobrazí modal pro vybranou kategorii
 *   – ticket:open:admin|...    (Button, zpětná kompatibilita) → modal
 *   – ticket:claim:ticketId    → převzetí ticketu
 *   – ticket:close:ticketId    → modal pro uzavření
 * @param {import('discord.js').ButtonInteraction|import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleButton(interaction) {
  // ── Select menu z ticket panelu ──────────────────────────────
  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket:select') {
      // Po výběru resetuj menu zpět na placeholder
      await interaction.message.edit({ components: interaction.message.components }).catch(() => {});
      return handleOpenTicket(interaction, interaction.values[0]);
    }
    return;
  }

  const parts     = interaction.customId.split(':');
  const action    = parts[0];
  const subaction = parts[1];
  const param     = parts[2];

  // ── Config panel tlačítka ─────────────────────────────────
  if (action === 'cfg') return handleConfigButton(interaction);
  if (action === 'ss')  return handleStatsButton(interaction);

  if (action !== 'ticket') return;

  switch (subaction) {
    case 'open':
      await handleOpenTicket(interaction, param);
      break;

    case 'close':
      await handleCloseConfirm(interaction, param);
      break;

    case 'closeconfirm':
      await handleCloseConfirmAnswer(interaction, param);
      break;

    default:
      await interaction.reply({ content: '❌ Neznámá akce.', flags: 64 });
  }
}

// ── Okamžité vytvoření ticketu (bez modalu) ───────────────────────────────────

async function handleOpenTicket(interaction, category) {
  // Ověř, že kategorie existuje v DB (s fallbackem na výchozí seznam)
  const categories = await getCategories();
  if (!categories.find(c => c.slug === category)) {
    return interaction.reply({ content: '❌ Neznámá kategorie ticketu.', flags: 64 });
  }

  // Oprávnění pro vytvoření (creator_roles) a premium check jsou řešeny uvnitř createTicket()
  await createTicket(interaction, category);
}

// ── Potvrzení zavření ticketu ─────────────────────────────────────────────────

async function handleCloseConfirm(interaction, ticketId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:closeconfirm:${ticketId}:ano`)
      .setLabel('Ano, zavřít')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket:closeconfirm:${ticketId}:ne`)
      .setLabel('Ne, zrušit')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: '🔒 **Opravdu chcete uzavřít tento ticket?**',
    components: [row],
  });
}

async function handleCloseConfirmAnswer(interaction, ticketId) {
  const answer = interaction.customId.split(':')[3]; // 'ano' nebo 'ne'

  if (answer === 'ne') {
    return interaction.update({ content: '↩️ Zavření ticketu bylo zrušeno.', components: [], flags: 0 });
  }

  await interaction.update({ content: '🔒 Zavírám ticket...', components: [] });
  await closeTicket(interaction, ticketId);
}

// ── Otevření modalu pro uzavření ticketu ──────────────────────────────────────
// (zachováno pro zpětnou kompatibilitu, ale již se nepoužívá)

module.exports = { handleButton };

'use strict';
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { buildPanelEmbed } = require('../utils/embeds');
const { getCategories, getConfig } = require('../database');

/**
 * Vrátí embed a dropdown menu pro ticket panel.
 * Kategorie a embed obsah jsou načteny z DB (s fallbackem na výchozí hodnoty).
 */
async function buildTicketPanel() {
  const categories = await getCategories();

  const [title, description, color] = await Promise.all([
    getConfig('panel_embed_title'),
    getConfig('panel_embed_description'),
    getConfig('panel_embed_color'),
  ]);

  const embed = buildPanelEmbed({ title, description, color });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket:select')
      .setPlaceholder('🤠 Vyber typ ticketu...')
      .addOptions(
        categories.map(cat =>
          new StringSelectMenuOptionBuilder()
            .setValue(cat.slug)
            .setLabel(cat.label)
            .setEmoji(cat.emoji),
        ),
      ),
  );

  return { embed, components: [row] };
}

module.exports = { buildTicketPanel };

'use strict';
const { Events, InteractionType } = require('discord.js');
const { handleButton } = require('../handlers/buttonHandler');
const { handleModal }  = require('../handlers/modalHandler');
const { buildErrorEmbed } = require('../utils/embeds');

module.exports = {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction, client) {
    try {
      // ── Slash příkazy ──────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          return interaction.reply({ content: '❌ Tento příkaz neexistuje.', flags: 64 });
        }
        await command.execute(interaction, client);
      }

      // ── Tlačítka ───────────────────────────────────────────────
      else if (interaction.isButton()) {
        await handleButton(interaction);
      }

      // ── Select menu (ticket panel dropdown) ────────────────────
      else if (interaction.isStringSelectMenu()) {
        await handleButton(interaction);
      }

      // ── Modaly ─────────────────────────────────────────────────
      else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }

    } catch (err) {
      console.error('[INTERACTION] Chyba:', err);

      const errEmbed = buildErrorEmbed(
        'Při zpracování interakce nastala neočekávaná chyba.\n```' + err.message + '```',
      );

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errEmbed], components: [] });
        } else {
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      } catch { /* Interakce vypršela */ }
    }
  },
};

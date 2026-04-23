'use strict';
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { stmts }         = require('../database');
const { buildStatsEmbed, buildErrorEmbed, COLORS } = require('../utils/embeds');
const { isAdmin }       = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Zobrazí statistiky ticket staffu')
    .addUserOption(opt =>
      opt.setName('uzivatel')
        .setDescription('Zobrazit statistiky jiného uživatele (pouze vedení)')
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    let targetMember = interaction.member;
    const targetOption = interaction.options.getMember('uzivatel');

    // Pokud je zadán jiný uživatel, zkontroluj oprávnění
    if (targetOption && targetOption.id !== interaction.member.id) {
      if (!await isAdmin(interaction.member)) {
        return interaction.editReply({
          embeds: [buildErrorEmbed('Pouze **Vedení** a **AL** mohou prohlížet statistiky ostatních.')],
        });
      }
      targetMember = targetOption;
    }

    // Statistiky z DB
    const stats = await stmts.getStats.get(targetMember.id);

    // Embed vlastní statistiky
    if (targetMember.id === interaction.member.id || targetOption?.id === interaction.member.id) {
      return interaction.editReply({
        embeds: [buildStatsEmbed(targetMember, stats)],
      });
    }

    return interaction.editReply({
      embeds: [buildStatsEmbed(targetMember, stats)],
    });
  },
};

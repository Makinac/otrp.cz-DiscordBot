'use strict';
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { buildSuccessEmbed, buildErrorEmbed } = require('../utils/embeds');
const { isAnyStaff } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Smaže zadaný počet zpráv v kanálu')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt =>
      opt.setName('cislo')
        .setDescription('Počet zpráv ke smazání (1–100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),

  async execute(interaction) {
    if (!await isAnyStaff(interaction.member)) {
      return interaction.reply({
        embeds: [buildErrorEmbed('Nemáš oprávnění k použití tohoto příkazu.')],
        flags: 64,
      });
    }

    const amount = interaction.options.getInteger('cislo');
    const channel = interaction.channel;

    await interaction.deferReply({ flags: 64 });

    try {
      // Discord bulk delete supports only messages < 14 days old
      const deleted = await channel.bulkDelete(amount, true);

      const count = deleted.size;
      const embed = buildSuccessEmbed(
        count > 0
          ? `🗑️ Smazáno **${count}** ${count === 1 ? 'zpráva' : count < 5 ? 'zprávy' : 'zpráv'} v kanálu ${channel}.`
          : '⚠️ Nebyly nalezeny žádné zprávy ke smazání (zprávy starší 14 dní nelze hromadně smazat).',
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[CLEAR]', err);
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Nepodařilo se smazat zprávy: ${err.message}`)],
      });
    }
  },
};

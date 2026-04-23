'use strict';
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const moment = require('moment');

const { stmts, getConfig } = require('../database');
const { isAnyStaff }       = require('../utils/permissions');
const { buildSuccessEmbed, buildErrorEmbed, buildLogEmbed, buildBlacklistListEmbed, COLORS } = require('../utils/embeds');
const config               = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Správa blacklistu zakázaných domén')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Přidá doménu na blacklist')
        .addStringOption(opt =>
          opt.setName('domena')
            .setDescription('Doména k zablokování (např. example.com)')
            .setRequired(true),
        ),
    )

    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Odebere doménu z blacklistu')
        .addStringOption(opt =>
          opt.setName('domena')
            .setDescription('Doména k odebrání')
            .setRequired(true),
        ),
    )

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Zobrazí seznam všech blacklistovaných domén'),
    ),

  async execute(interaction) {
    // Pouze staff
    if (!await isAnyStaff(interaction.member)) {
      return interaction.reply({
        embeds: [buildErrorEmbed('Nedostatečná oprávnění. Pouze staff může spravovat blacklist.')],
        flags: 64,
      });
    }

    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'add':    return handleAdd(interaction);
      case 'remove': return handleRemove(interaction);
      case 'list':   return handleList(interaction);
    }
  },
};

// ── /blacklist add ─────────────────────────────────────────────────────────────
async function handleAdd(interaction) {
  await interaction.deferReply({ flags: 64 });

  let domain = interaction.options.getString('domena').toLowerCase().trim();

  // Sanitizace – odeber protokol a www.
  domain = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];

  if (!domain.includes('.') || domain.length > 253) {
    return interaction.editReply({
      embeds: [buildErrorEmbed(`Neplatná doména: \`${domain}\``)],
    });
  }

  const changes = await stmts.addBlacklist.run(domain, interaction.user.tag, moment().toISOString());

  if (changes.changes === 0) {
    return interaction.editReply({
      embeds: [buildErrorEmbed(`Doména \`${domain}\` je již na blacklistu.`)],
    });
  }

  // Log
  await sendModLog(interaction.guild, 'blacklist_add', {
    fields: [
      { name: '🚫 Doména',     value: `\`${domain}\``,                    inline: true },
      { name: '👤 Přidal',     value: `<@${interaction.user.id}>`,         inline: true },
      { name: '🕐 Čas',        value: moment().format('D. M. YYYY HH:mm'), inline: true },
    ],
  });

  return interaction.editReply({
    embeds: [buildSuccessEmbed(`Doména \`${domain}\` byla přidána na blacklist.`)],
  });
}

// ── /blacklist remove ──────────────────────────────────────────────────────────
async function handleRemove(interaction) {
  await interaction.deferReply({ flags: 64 });

  let domain = interaction.options.getString('domena').toLowerCase().trim();
  domain = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];

  const changes = await stmts.removeBlacklist.run(domain);

  if (changes.changes === 0) {
    return interaction.editReply({
      embeds: [buildErrorEmbed(`Doména \`${domain}\` není na blacklistu.`)],
    });
  }

  // Log
  await sendModLog(interaction.guild, 'blacklist_remove', {
    fields: [
      { name: '✅ Doména',  value: `\`${domain}\``,              inline: true },
      { name: '👤 Odebral', value: `<@${interaction.user.id}>`,   inline: true },
      { name: '🕐 Čas',     value: moment().format('D. M. YYYY HH:mm'), inline: true },
    ],
  });

  return interaction.editReply({
    embeds: [buildSuccessEmbed(`Doména \`${domain}\` byla odebrána z blacklistu.`)],
  });
}

// ── /blacklist list ────────────────────────────────────────────────────────────
async function handleList(interaction) {
  await interaction.deferReply({ flags: 64 });

  const rows = await stmts.getBlacklist.all();

  if (rows.length === 0) {
    return interaction.editReply({
      embeds: [buildSuccessEmbed('Blacklist je prázdný.')],
    });
  }

  // Stránkování – max 40 domén na embed (aby nepřesáhl 4096 znaků)
  const CHUNK = 40;
  const pages = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    pages.push(rows.slice(i, i + CHUNK));
  }

  const embeds = pages.map((page, idx) => {
    const lines = page.map((r, i) => `\`${String(idx * CHUNK + i + 1).padStart(3, ' ')}.\` \`${r.domain}\``);
    return buildBlacklistListEmbed(lines, idx + 1, pages.length, rows.length);
  });

  return interaction.editReply({ embeds: embeds.slice(0, 10) }); // Discord max 10 embedů
}

// ── Helper ─────────────────────────────────────────────────────────────────────
async function sendModLog(guild, action, data) {
  const modLogId = await getConfig('mod_log_channel') || config.channels.modLog;
  if (!modLogId) return;
  const ch = guild.channels.cache.get(modLogId);
  if (!ch) return;
  try {
    await ch.send({ embeds: [buildLogEmbed(action, data)] });
  } catch { /* kanál nedostupný */ }
}

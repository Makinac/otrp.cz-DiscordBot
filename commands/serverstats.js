'use strict';
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { isAdmin }   = require('../utils/permissions');
const { getConfig, setConfig } = require('../database');
const { COLORS }    = require('../utils/embeds');
const { updateStats } = require('../utils/statsUpdater');

// ── Slash command ─────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Nastavení a správa stats kanálů')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!await isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Nedostatečná oprávnění.',
        flags: 64,
      });
    }
    await interaction.reply({
      embeds: [await buildStatsEmbed(interaction.guild)],
      components: buildStatsButtons(),
      flags: 64,
    });
  },
};

// ── Embed ─────────────────────────────────────────────────────────────────────
async function buildStatsEmbed(guild) {
  const fmtCh = id => id ? `<#${id}>` : '`nenastaveno`';
  const fmtRole = id => id ? `<@&${id}>` : '`nenastaveno`';

  return new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle('📊  Server Stats – Konfigurace')
    .addFields(
      {
        name: '📺 Stats kanály (voice)',
        value: [
          `👥 **Celkem členů:**  ${fmtCh(await getConfig('stats_channel_total'))}  \`${await getConfig('stats_format_total') || '👥 Members: %'}\``,
          `✅ **Allowlist:**     ${fmtCh(await getConfig('stats_channel_al'))}  \`${await getConfig('stats_format_al') || '✅ Allowlisted: %'}\``,
          `🎤 **Pohovor:**       ${fmtCh(await getConfig('stats_channel_interview'))}  \`${await getConfig('stats_format_interview') || '🎤 Pohovor: %'}\``,
          `🎮 **RedM online:**  ${fmtCh(await getConfig('stats_channel_redm'))}  \`${await getConfig('stats_format_redm') || '🎮 Online: %/64'}\``,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🔢 Role & server',
        value: [
          `✅ **Role Allowlist:**  ${fmtRole(await getConfig('stats_role_al'))}`,
          `🎤 **Role Pohovor:**    ${fmtRole(await getConfig('stats_role_interview'))}`,
          `🎮 **RedM URL:**       \`${await getConfig('stats_redm_url') || 'nenastaveno'}\``,
        ].join('\n'),
        inline: false,
      },
    )
    .setTimestamp();
}

// ── Tlačítka ──────────────────────────────────────────────────────────────────
function buildStatsButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ss:channels').setLabel('Stats kanály').setEmoji('📺').setStyle(ButtonStyle.Secondary),      new ButtonBuilder().setCustomId('ss:formats').setLabel('Formáty názvů').setEmoji('✏️').setStyle(ButtonStyle.Secondary),      new ButtonBuilder().setCustomId('ss:roles').setLabel('Role & server').setEmoji('🔢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ss:refresh').setLabel('Obnovit').setEmoji('🔄').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ss:update').setLabel('Aktualizovat názvy').setEmoji('⚡').setStyle(ButtonStyle.Success),
    ),
  ];
}

// ── Button handler (voláno z buttonHandler.js) ────────────────────────────────
async function handleStatsButton(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Nedostatečná oprávnění.', flags: 64 });
  }

  const id = interaction.customId;

  if (id === 'ss:refresh') {
    return interaction.update({
      embeds: [await buildStatsEmbed(interaction.guild)],
      components: buildStatsButtons(),
    });
  }

  if (id === 'ss:update') {
    await interaction.deferUpdate();
    await updateStats(interaction.client).catch(() => {});
    return interaction.editReply({
      embeds: [await buildStatsEmbed(interaction.guild)],
      components: buildStatsButtons(),
    });
  }

  if (id === 'ss:formats') {
    const modal = new ModalBuilder()
      .setCustomId('ss_modal:formats')
      .setTitle('✏️ Formáty názvů kanálů (% = číslo)');

    const fields = [
      { id: 'fmt_total',     label: '👥 Celkem členů',    key: 'stats_format_total',     def: '👥 Members: %' },
      { id: 'fmt_al',        label: '✅ Allowlist',         key: 'stats_format_al',        def: '✅ Allowlisted: %' },
      { id: 'fmt_interview', label: '🎤 Pohovor',         key: 'stats_format_interview', def: '🎤 Pohovor: %' },
      { id: 'fmt_redm',      label: '🎮 RedM online',     key: 'stats_format_redm',      def: '🎮 Online: %/64' },
    ];

    for (const f of fields) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`např. ${f.def}`)
            .setValue(await getConfig(f.key) || f.def)
            .setRequired(false),
        ),
      );
    }
    return interaction.showModal(modal);
  }

  if (id === 'ss:channels') {
    const modal = new ModalBuilder()
      .setCustomId('ss_modal:channels')
      .setTitle('📺 Stats kanály (ID voice kanálů)');

    const fields = [
      { id: 'total',     label: '👥 Celkem členů',      ph: 'ID voice kanálu...' },
      { id: 'al',        label: '✅ Allowlist',          ph: 'ID voice kanálu...' },
      { id: 'interview', label: '🎤 Čeká na pohovor',   ph: 'ID voice kanálu...' },
        { id: 'redm',     label: '🎮 RedM online',      ph: 'ID voice kanálu...' },
    ];
    const keyMap = { total: 'stats_channel_total', al: 'stats_channel_al', interview: 'stats_channel_interview', redm: 'stats_channel_redm' };

    for (const f of fields) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(f.ph)
            .setValue(await getConfig(keyMap[f.id]) || '')
            .setRequired(false),
        ),
      );
    }
    return interaction.showModal(modal);
  }

  if (id === 'ss:roles') {
    const modal = new ModalBuilder()
      .setCustomId('ss_modal:roles')
      .setTitle('🔢 Role & herní server');

    const fields = [
      { id: 'role_al',        label: 'ID role Allowlist',       ph: 'ID role...',          key: 'stats_role_al' },
      { id: 'role_interview', label: 'ID role Čeká na pohovor', ph: 'ID role...',          key: 'stats_role_interview' },
      { id: 'redm_url',      label: 'RedM URL (IP:PORT)',      ph: 'http://IP:PORT',      key: 'stats_redm_url' },
    ];

    for (const f of fields) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(f.ph)
            .setValue(await getConfig(f.key) || '')
            .setRequired(false),
        ),
      );
    }
    return interaction.showModal(modal);
  }
}

// ── Modal handler (voláno z modalHandler.js) ──────────────────────────────────
async function handleStatsModal(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Nedostatečná oprávnění.', flags: 64 });
  }

  const type = interaction.customId.replace('ss_modal:', '');

  if (type === 'formats') {
    const keyMap = {
      fmt_total:     'stats_format_total',
      fmt_al:        'stats_format_al',
      fmt_interview: 'stats_format_interview',
      fmt_redm:      'stats_format_redm',
    };
    for (const [field, key] of Object.entries(keyMap)) {
      const val = interaction.fields.getTextInputValue(field).trim();
      if (val) await setConfig(key, val);
    }
  } else if (type === 'channels') {
    const keyMap = { total: 'stats_channel_total', al: 'stats_channel_al', interview: 'stats_channel_interview', redm: 'stats_channel_redm' };
    for (const [field, key] of Object.entries(keyMap)) {
      const val = interaction.fields.getTextInputValue(field).trim();
      if (val) await setConfig(key, val);
    }
  } else if (type === 'roles') {
    const alVal    = interaction.fields.getTextInputValue('role_al').trim();
    const intVal   = interaction.fields.getTextInputValue('role_interview').trim();
    const redmVal = interaction.fields.getTextInputValue('redm_url').trim();
    if (alVal)    await setConfig('stats_role_al', alVal);
    if (intVal)   await setConfig('stats_role_interview', intVal);
    if (redmVal) await setConfig('stats_redm_url', redmVal);
  }

  await interaction.reply({
    embeds: [await buildStatsEmbed(interaction.guild)],
    components: buildStatsButtons(),
    flags: 64,
  });
}

module.exports.handleStatsButton = handleStatsButton;
module.exports.handleStatsModal  = handleStatsModal;

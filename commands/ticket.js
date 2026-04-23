'use strict';
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { isAdmin, isAnyStaff } = require('../utils/permissions');
const { buildTicketPanel }    = require('../views/ticketPanel');
const { buildSuccessEmbed, buildErrorEmbed, COLORS } = require('../utils/embeds');
const { setConfig, getConfig, getCategories } = require('../database');
const config = require('../config');

// ── Slash command definition ──────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Správa ticket systému')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Vytvoří panel pro vytváření ticketů v zadaném kanálu')
        .addChannelOption(opt =>
          opt.setName('kanal')
            .setDescription('Kanál kde se panel zobrazí (výchozí: aktuální kanál)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Přidá uživatele nebo roli do aktuálního ticketu')
        .addUserOption(opt =>
          opt.setName('uzivatel')
            .setDescription('Uživatel, kterého chceš přidat')
            .setRequired(false),
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role, kterou chceš přidat')
            .setRequired(false),
        ),
    )

    .addSubcommand(sub =>
      sub.setName('config')
        .setDescription('Otevře interaktivní panel konfigurace ticket systému'),
    ),

  // ── Execute ──────────────────────────────────────────────────────────────────
  async execute(interaction) {
    if (!await isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [buildErrorEmbed('❌ Nedostatečná oprávnění. Pouze **Vedení** mohou používat tento příkaz.')],
        flags: 64,
      });
    }

    const sub = interaction.options.getSubcommand(false);
    if (sub === 'setup')  return handleSetup(interaction);
    if (sub === 'add')    return handleAdd(interaction);
    if (sub === 'config') return handleConfigPanel(interaction);
    return interaction.reply({ content: '❌ Neznámý příkaz.', flags: 64 });
  },
};

// ── /ticket setup ─────────────────────────────────────────────────────────────
async function handleSetup(interaction) {
  const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
  await interaction.deferReply({ flags: 64 });
  try {
    const { embed, components } = await buildTicketPanel();
    const panelMsg = await targetChannel.send({ embeds: [embed], components });

    // Ulož ID kanálu a zprávy pro pozdější refresh z web panelu
    await setConfig('ticket_panel_channel_id', targetChannel.id);
    await setConfig('ticket_panel_message_id', panelMsg.id);

    await interaction.editReply({
      embeds: [buildSuccessEmbed(`✅ Ticket panel byl úspěšně vytvořen v kanálu ${targetChannel}.`)],
    });
  } catch (err) {
    console.error('[TICKET SETUP]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Nepodařilo se vytvořit panel: ${err.message}`)],
    });
  }
}

// ── /ticket add ───────────────────────────────────────────────────────────────
async function handleAdd(interaction) {
  const channel = interaction.channel;
  const user    = interaction.options.getUser('uzivatel');
  const role    = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({
      embeds: [buildErrorEmbed('Musíš zadat alespoň jednoho uživatele nebo roli.')],
      flags: 64,
    });
  }

  const { stmts } = require('../database');
  const ticket = await stmts.getTicketByChannel.get(channel.id);
  const isTicketAuthor = ticket?.user_id === interaction.user.id;
  if (!await isAnyStaff(interaction.member) && !isTicketAuthor) {
    return interaction.reply({
      embeds: [buildErrorEmbed('Pouze staff nebo autor ticketu může přidávat osoby do ticketu.')],
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });
  try {
    if (user) {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.editReply({ embeds: [buildErrorEmbed(`Uživatel ${user} nebyl nalezen na serveru.`)] });
      await channel.permissionOverwrites.edit(member, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }, { type: OverwriteType.Member });
    }
    if (role) {
      await channel.permissionOverwrites.edit(role, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }, { type: OverwriteType.Role });
    }
    const mentions = [user ? `<@${user.id}>` : null, role ? `<@&${role.id}>` : null].filter(Boolean).join(' ');
    const added    = [user ? `${user}` : null, role ? `${role}` : null].filter(Boolean).join(' a ');
    await interaction.editReply({ embeds: [buildSuccessEmbed(`${added} ${user && role ? 'byly přidány' : 'byl/a přidán/a'} do ticketu.`)] });
    await channel.send({ content: `👋 ${mentions} ${user && role ? 'byly přidány' : 'byl/a přidán/a'} do tohoto ticketu.` });
  } catch (err) {
    console.error('[TICKET ADD]', err);
    await interaction.editReply({ embeds: [buildErrorEmbed(`Nepodařilo se přidat: ${err.message}`)] });
  }
}

// ── /ticket config – interaktivní panel ──────────────────────────────────────

async function buildConfigEmbed(guild) {
  const fmtCh = id => id ? `<#${id}>` : '`nenastaveno`';
  const fmtRoles = async (key, fallback) => {
    const ids = (await getConfig(key) || fallback?.join(',') || '').split(',').filter(Boolean);
    return ids.length ? ids.map(id => `<@&${id}>`).join(', ') : '`žádné`';
  };

  const logCh   = await getConfig('ticket_log_channel') || config.channels.ticketLog;
  const transCh = await getConfig('transcript_channel') || config.channels.transcript;
  const modCh   = await getConfig('mod_log_channel') || config.channels.modLog;

  const categories = await getCategories();

  const categoryLines = [];
  for (const cat of categories) {
    const id = await getConfig(`ticket_category_${cat.slug}`);
    categoryLines.push(`${cat.emoji} **${cat.slug}:** ${id ? `\`${guild.channels.cache.get(id)?.name ?? id}\`` : '`nenastaveno`'}`);
  }

  const staffLines = [];
  for (const cat of categories) {
    staffLines.push(`${cat.emoji} **${cat.slug}:** ${await fmtRoles(`staff_roles_${cat.slug}`, config.ticketStaffRoles?.[cat.slug])}`);
  }

  return new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle('⚙️  Konfigurace Ticket Systému')
    .addFields(
      {
        name: '📋 Kanály',
        value: [
          `📌 **Log:** ${fmtCh(logCh)}`,
          `📜 **Transcript:** ${fmtCh(transCh)}`,
          `🔧 **Mod-log:** ${fmtCh(modCh)}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📁 Ticket kategorie (Discord složky)',
        value: categoryLines.join('\n') || '`Žádné kategorie`',
        inline: false,
      },
      {
        name: '👥 Staff role',
        value: staffLines.join('\n') || '`Žádné kategorie`',
        inline: false,
      },
    )
    .setTimestamp();
}

function buildConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cfg:log').setLabel('Log kanál').setEmoji('📌').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cfg:transcript').setLabel('Transcript kanál').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cfg:modlog').setLabel('Mod-log kanál').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cfg:category').setLabel('Ticket kategorie').setEmoji('📁').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cfg:staff').setLabel('Staff role').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cfg:refresh').setLabel('Obnovit').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    ),
  ];
}

async function handleConfigPanel(interaction) {
  await interaction.reply({
    embeds: [await buildConfigEmbed(interaction.guild)],
    components: buildConfigButtons(),
    flags: 64,
  });
}

// ── Tlačítka config panelu (voláno z buttonHandler) ───────────────────────────

async function handleConfigButton(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Nedostatečná oprávnění.', flags: 64 });
  }

  const id = interaction.customId;

  if (id === 'cfg:refresh') {
    return interaction.update({
      embeds: [await buildConfigEmbed(interaction.guild)],
      components: buildConfigButtons(),
    });
  }

  const categories = await getCategories();
  // Discord modal limit: max 5 TextInput fields
  const catSlice = categories.slice(0, 5);

  const staticDefs = {
    'cfg:log':        { title: '📌 Log kanál',        fields: [{ id: 'value', label: 'ID kanálu', ph: 'Vlož ID text kanálu...' }] },
    'cfg:transcript': { title: '📜 Transcript kanál', fields: [{ id: 'value', label: 'ID kanálu', ph: 'Vlož ID text kanálu...' }] },
    'cfg:modlog':     { title: '🔧 Mod-log kanál',    fields: [{ id: 'value', label: 'ID kanálu', ph: 'Vlož ID text kanálu...' }] },
  };

  let def;
  if (staticDefs[id]) {
    def = staticDefs[id];
  } else if (id === 'cfg:category') {
    def = {
      title: '📁 Ticket kategorie (ID Discord složek)',
      fields: catSlice.map(cat => ({
        id:  cat.slug,
        label: `${cat.emoji} ${cat.label}`.slice(0, 45),
        ph:  'ID Discord kategorie...',
      })),
    };
  } else if (id === 'cfg:staff') {
    def = {
      title: '👥 Staff role IDs (oddělené čárkou)',
      fields: catSlice.map(cat => ({
        id:  cat.slug,
        label: `${cat.emoji} ${cat.label} staff`.slice(0, 45),
        ph:  'např. 111222,333444',
      })),
    };
  } else {
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`cfg_modal:${id.replace('cfg:', '')}`)
    .setTitle(def.title);

  for (const f of def.fields) {
    const current = await (async () => {
      if (id === 'cfg:log')        return await getConfig('ticket_log_channel') || config.channels.ticketLog || '';
      if (id === 'cfg:transcript') return await getConfig('transcript_channel') || config.channels.transcript || '';
      if (id === 'cfg:modlog')     return await getConfig('mod_log_channel') || config.channels.modLog || '';
      if (id === 'cfg:category')   return await getConfig(`ticket_category_${f.id}`) || '';
      if (id === 'cfg:staff')      return await getConfig(`staff_roles_${f.id}`) || config.ticketStaffRoles?.[f.id]?.join(',') || '';
      return '';
    })();

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(f.ph)
          .setValue(current)
          .setRequired(false),
      ),
    );
  }

  await interaction.showModal(modal);
}

// ── Modal submit config (voláno z modalHandler) ───────────────────────────────

async function handleConfigModal(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Nedostatečná oprávnění.', flags: 64 });
  }

  const type = interaction.customId.replace('cfg_modal:', '');

  if (type === 'log') {
    const val = interaction.fields.getTextInputValue('value').trim();
    if (val) await setConfig('ticket_log_channel', val);
  } else if (type === 'transcript') {
    const val = interaction.fields.getTextInputValue('value').trim();
    if (val) await setConfig('transcript_channel', val);
  } else if (type === 'modlog') {
    const val = interaction.fields.getTextInputValue('value').trim();
    if (val) await setConfig('mod_log_channel', val);
  } else if (type === 'category') {
    const categories = await getCategories();
    for (const cat of categories.slice(0, 5)) {
      const val = interaction.fields.getTextInputValue(cat.slug).trim();
      if (val) await setConfig(`ticket_category_${cat.slug}`, val);
    }
  } else if (type === 'staff') {
    const categories = await getCategories();
    for (const cat of categories.slice(0, 5)) {
      const val = interaction.fields.getTextInputValue(cat.slug).trim();
      await setConfig(`staff_roles_${cat.slug}`, val);
    }
  }

  await interaction.reply({
    embeds: [await buildConfigEmbed(interaction.guild)],
    components: buildConfigButtons(),
    flags: 64,
  });
}

module.exports.handleConfigButton = handleConfigButton;
module.exports.handleConfigModal  = handleConfigModal;

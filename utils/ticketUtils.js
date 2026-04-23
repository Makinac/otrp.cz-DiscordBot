'use strict';
const {
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
  OverwriteType,
  MessageFlags,
} = require('discord.js');
const moment = require('moment');

const config                  = require('../config');
const { stmts, getNextTicketNumber, getConfig, getCategories } = require('../database');
const { buildTicketControlEmbed, buildLogEmbed, COLORS } = require('./embeds');
const { buildTicketControls } = require('../views/ticketControls');
const { generateTranscript }  = require('./transcript');
const { isStaffForCategory }  = require('./permissions');

/**
 * Vrátí ID Discord kategorie pro daný typ ticketu
 * (z DB config, nebo fallback na .env).
 * @param {string} category
 * @returns {string|null}
 */
async function getTicketCategoryId(category) {
  return await getConfig(`ticket_category_${category}`) || config.ticketCategories[category] || null;
}

/**
 * Vrátí staff role ID pro danou kategorii
 * @param {string} category
 * @returns {string[]}
 */
async function getStaffRoles(category) {
  const dbRoles = await getConfig(`staff_roles_${category}`);
  return dbRoles
    ? dbRoles.split(',').map(s => s.trim()).filter(Boolean)
    : config.ticketStaffRoles[category] || [];
}

/**
 * Vrátí ID log kanálu (z DB nebo .env).
 * @returns {string|null}
 */
async function getLogChannelId() {
  return await getConfig('ticket_log_channel') || config.channels.ticketLog || null;
}

/**
 * Vrátí ID transcript kanálu (z DB nebo .env).
 * @returns {string|null}
 */
async function getTranscriptChannelId() {
  return await getConfig('transcript_channel') || config.channels.transcript || null;
}

// ── Vytvoření ticketu ─────────────────────────────────────────────────────────

/**
 * Vytvoří nový ticket kanál a uloží záznam do DB.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {string} category  – 'admin' | 'dev' | 'faction' | 'vedeni'
 * @param {string} subject
 * @param {string} description
 */
async function createTicket(interaction, category, subject = '', description = '') {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild  = interaction.guild;
  const member = interaction.member;

  // Načti kategorii dynamicky z DB (s fallbackem)
  const allCategories = await getCategories();
  const catRaw = allCategories.find(c => c.slug === category);
  if (!catRaw) {
    return interaction.editReply({ content: `❌ Neznámá kategorie ticketu: **${category}**` });
  }
  // Převeď hex barvu na integer pro Discord embeds
  const catMeta = { ...catRaw, color: catRaw.color ? parseInt(catRaw.color, 16) : 0xF1C40F };

  // Zkontroluj oprávnění pro vytvoření ticketu v této kategorii
  const creatorRolesRaw = await getConfig(`creator_roles_${category}`);
  if (creatorRolesRaw) {
    const creatorRoleIds = creatorRolesRaw.split(',').map(s => s.trim()).filter(Boolean)
      .filter(id => guild.roles.cache.has(id));
    if (creatorRoleIds.length > 0) {
      const canCreate = creatorRoleIds.some(id => member.roles.cache.has(id));
      if (!canCreate) {
        return interaction.editReply({
          content: `❌ Nemáš oprávnění pro vytvoření **${catMeta.label}**. Je vyžadována specifická role.`,
        });
      }
    }
  }

  // Zjisti, zda uživatel nemá již otevřený ticket ve stejné kategorii
  const existing = await stmts.getOpenTicketByUser.get(member.id, category);
  if (existing) {
    return interaction.editReply({
      content: `❌ Již máš otevřený ticket v kategorii **${catMeta.label}**: <#${existing.channel_id}>`,
    });
  }

  // Zkontroluj limit 10 otevřených ticketů na kategorii
  const { count } = await stmts.countOpenTicketsByCategory.get(category);
  if (count >= 10) {
    return interaction.editReply({
      content: `❌ Kategorie **${catMeta.label}** má momentálně plno (${count}/10 otevřených ticketů). Zkus to prosím později.`,
    });
  }

  // Získej číslo ticketu
  const ticketNumber = await getNextTicketNumber();
  const ticketId     = String(ticketNumber).padStart(4, '0');
  const channelName  = `ticket-${ticketId}`;
  const now          = moment().toISOString();

  // Urči Discord kategorii
  const discordCategoryId = await getTicketCategoryId(category);
  const discordCategory   = discordCategoryId ? guild.channels.cache.get(discordCategoryId) : null;

  // Oprávnění kanálu
  const staffRoleIds = (await getStaffRoles(category))
    .filter(id => guild.roles.cache.has(id)); // ignoruj neexistující role
  const permOverwrites = [
    // @everyone – zakázat vidět kanál
    { id: guild.id,             type: OverwriteType.Role,   deny:  [PermissionFlagsBits.ViewChannel] },
    // Bot – plná oprávnění
    { id: guild.members.me.id,  type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
    // Žadatel
    { id: member.id,            type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
    // Staff role pro tuto kategorii
    ...staffRoleIds.map(roleId => ({
      id: roleId,
      type: OverwriteType.Role,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks],
    })),
  ];

  // Přidej VEDENI_STAFF_ROLES (superadmin – vždy mají přístup ke všem ticketům)
  const vedeniRoleIds = (await getConfig('staff_roles_vedeni') || config.ticketStaffRoles.vedeni?.join(',') || '')
    .split(',').map(s => s.trim()).filter(id => id && !staffRoleIds.includes(id) && guild.roles.cache.has(id));
  for (const roleId of vedeniRoleIds) {
    permOverwrites.push({
      id: roleId,
      type: OverwriteType.Role,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  // Vytvoř kanál
  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: discordCategory?.id ?? null,
      permissionOverwrites: permOverwrites,
      topic: `Ticket #${ticketId} | Kategorie: ${catMeta.label} | Žadatel: ${member.user.tag}`,
    });
  } catch (err) {
    console.error('[TICKET] Chyba při vytváření kanálu:', err);
    return interaction.editReply({ content: '❌ Nepodařilo se vytvořit ticket kanál. Zkontroluj oprávnění bota.' });
  }

  // Ulož do DB
  const ticketData = {
    ticket_id:   ticketId,
    channel_id:  ticketChannel.id,
    user_id:     member.id,
    username:    member.user.tag,
    category,
    subject:     subject.slice(0, 200),
    description: description.slice(0, 1000),
    created_at:  now,
  };
  await stmts.createTicket.run(ticketData);

  // Pošli kontrolní embed do kanálu
  const ticket  = await stmts.getTicket.get(ticketId);

  // Per-category embed opts: falls back to global, then to built-in defaults
  const [catTitle, catDesc, catFooter, globalTitle, globalDesc, globalFooter] = await Promise.all([
    getConfig(`ticket_embed_title_${category}`),
    getConfig(`ticket_embed_description_${category}`),
    getConfig(`ticket_embed_footer_${category}`),
    getConfig('ticket_embed_title'),
    getConfig('ticket_embed_description'),
    getConfig('ticket_embed_footer'),
  ]);
  const ctrlEmbed = buildTicketControlEmbed(ticket, catMeta, null, {
    title:       catTitle       || globalTitle,
    description: catDesc        || globalDesc,
    footer:      catFooter      || globalFooter,
  });
  const ctrlRow   = buildTicketControls(ticketId);

  await ticketChannel.send({
    content: `${member}`,
    embeds: [ctrlEmbed],
    components: [ctrlRow],
  });

  // Informuj žadatele
  await interaction.editReply({
    content: `✅ Tvůj ticket byl vytvořen: ${ticketChannel}`,
  });

  // Pošli log
  await sendTicketLog(guild, 'ticket_open', {
    fields: [
      { name: '🎟️ Ticket',    value: `#${ticketId}`,                              inline: true },
      { name: '📂 Kategorie', value: catMeta.label,                               inline: true },
      { name: '👤 Žadatel',   value: `<@${member.id}> (${member.user.tag})`,      inline: true },
      { name: '📺 Kanál',     value: `<#${ticketChannel.id}>`,                    inline: true },
    ],
  });
}

// ── Převzetí ticketu ──────────────────────────────────────────────────────────

// ── Uzavření ticketu ──────────────────────────────────────────────────────────

/**
 * Uzavře ticket – generuje transcript, přesune/smaže kanál.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {string} ticketId
 */
async function closeTicket(interaction, ticketId) {
  const ticket = await stmts.getTicket.get(ticketId);
  if (!ticket) {
    if (interaction.replied || interaction.deferred) {
      return interaction.editReply({ content: '❌ Ticket nenalezen.' });
    }
    return interaction.reply({ content: '❌ Ticket nenalezen.', flags: 64 });
  }
  if (ticket.status === 'closed') {
    if (interaction.replied || interaction.deferred) {
      return interaction.editReply({ content: '❌ Ticket je již uzavřen.' });
    }
    return interaction.reply({ content: '❌ Ticket je již uzavřen.', flags: 64 });
  }

  // Pokud interakce ještě nebyla zodpovězena, deferuj ji
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: 64 });
  }

  const guild    = interaction.guild;
  const member   = interaction.member;
  const channel  = interaction.channel;
  const now      = moment().toISOString();
  const catMeta  = await (async () => {
    const allCats = await getCategories();
    const raw = allCats.find(c => c.slug === ticket.category);
    return raw
      ? { ...raw, color: raw.color ? parseInt(raw.color, 16) : COLORS.gold }
      : { label: ticket.category, emoji: '🎟️', color: COLORS.gold };
  })();

  // Update DB
  await stmts.closeTicket.run(now, null, member.id, ticketId);

  // Statistiky (pokud staff)
  if (await isStaffForCategory(member, ticket.category)) {
    await stmts.upsertStats.run({
      user_id: member.id, username: member.user.tag,
      tickets_claimed: 0, tickets_closed: 1, last_activity: now,
    });
  }

  // Generuj transcript
  let transcriptPath = null;
  try {
    transcriptPath = await generateTranscript(await stmts.getTicket.get(ticketId), channel, member);
  } catch (err) {
    console.error('[TICKET] Chyba při generování transkriptu:', err);
  }

  // Pošli uzavírací zprávu v kanálu
  await channel.send({
    embeds: [
      buildLogEmbed('ticket_close', {
        fields: [
          { name: '🔒 Uzavřel', value: `<@${member.id}> (${member.user.tag})`, inline: true },
          { name: ' Čas', value: moment(now).format('D. M. YYYY HH:mm:ss'), inline: true },
        ],
      }),
    ],
  });

  // Odeslání transkriptu do transcript kanálu (pouze HTML soubor)
  const transcriptChannelId = await getTranscriptChannelId();
  if (transcriptChannelId && transcriptPath) {
    const transcriptChannel = guild.channels.cache.get(transcriptChannelId);
    if (transcriptChannel) {
      const attachment = new AttachmentBuilder(transcriptPath, {
        name: `transcript-${ticketId}.html`,
        description: `Transcript ticketu #${ticketId}`,
      });
      await transcriptChannel.send({ files: [attachment] });
    }
  }

  // Log kanál
  await sendTicketLog(guild, 'ticket_close', {
    fields: [
      { name: '🎟️ Ticket', value: `#${ticketId}`, inline: true },
      { name: '📂 Kategorie', value: catMeta.label, inline: true },
      { name: '👤 Žadatel', value: `<@${ticket.user_id}>`, inline: true },
      { name: '🔒 Uzavřel', value: `<@${member.id}>`, inline: true },
    ],
  });

  // Zjisti akci při zavření (move nebo delete) a ID uzavřené kategorie
  const closeAction  = (await getConfig(`ticket_close_action_${ticket.category}`)) || 'move';
  const closedCatId  = closeAction === 'move'
    ? (await getConfig(`ticket_closed_category_${ticket.category}`)
        || await getConfig('ticket_category_closed')
        || config.ticketCategories?.closed
        || null)
    : null;

  const actionMsg = (closeAction === 'delete' || !closedCatId)
    ? '✅ Ticket bude smazán za 10 sekund.'
    : '✅ Ticket bude přesunut do uzavřených za 10 sekund.';

  await interaction.editReply({ content: actionMsg });

  setTimeout(async () => {
    try {
      if (closeAction === 'delete' || !closedCatId) {
        await channel.delete(`Ticket #${ticketId} uzavřen`);
      } else {
        await channel.setParent(closedCatId, {
          lockPermissions: false,
          reason: `Ticket #${ticketId} uzavřen`,
        });
        // Odeber přístupu původního žadatele po přesunu
        await channel.permissionOverwrites.edit(
          ticket.user_id,
          { ViewChannel: false },
          { type: OverwriteType.Member },
        ).catch(() => {});
      }
    } catch (err) {
      console.error('[TICKET] Chyba při uzavření kanálu:', err);
    }
  }, 10_000);
}

// ── Helper: odeslání do log kanálu ───────────────────────────────────────────

async function sendTicketLog(guild, action, data) {
  const logChannelId = await getLogChannelId();
  if (!logChannelId) return;
  const logChannel = guild.channels.cache.get(logChannelId);
  if (!logChannel) return;
  try {
    await logChannel.send({ embeds: [buildLogEmbed(action, data)] });
  } catch { /* Log kanál nedostupný */ }
}

module.exports = { createTicket, closeTicket };

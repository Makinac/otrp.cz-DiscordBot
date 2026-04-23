'use strict';
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const mysql   = require('mysql2/promise');
const moment  = require('moment');

const { getConfig }    = require('../database');
const { isAnyStaff }   = require('../utils/permissions');
const { buildErrorEmbed, buildSuccessEmbed, buildLogEmbed, buildMuteResponseEmbed, buildMuteModlogEmbed, buildMuteDmEmbed, buildMuteUnmuteEmbed, COLORS } = require('../utils/embeds');

// ── Web-DB pool (read users, write player_mutes) ───────────────────────────────
let webPool;
function getWebPool() {
  if (!webPool) {
    webPool = mysql.createPool({
      host:               process.env.DB_HOST     || 'localhost',
      port:               parseInt(process.env.DB_PORT) || 3306,
      user:               process.env.DB_USER,
      password:           process.env.DB_PASSWORD,
      database:           'web',
      waitForConnections: true,
      connectionLimit:    5,
      charset:            'utf8mb4',
    });
  }
  return webPool;
}

// ── Parsování trvání ──────────────────────────────────────────────────────────
/** Vrátí ISO datetime nebo null (perma) */
function parseDuration(amount, unit) {
  if (unit === 'perma') return null;
  if (!Number.isInteger(amount) || amount <= 0) return null;
  const map = { m: 'minutes', h: 'hours', d: 'days' };
  if (!map[unit]) return null;
  return moment().add(amount, map[unit]).toDate();
}

/** Lidsky čitelný popis trvání */
function durationLabel(amount, unit) {
  if (unit === 'perma') return '**Permanentní**';
  const map = { m: 'minut', h: 'hodin', d: 'dní' };
  if (!Number.isInteger(amount) || amount <= 0 || !map[unit]) {
    return '**Neznámé trvání**';
  }
  return `**${amount} ${map[unit]}**`;
}

// ── Hlavní příkaz ─────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Umlčí uživatele – přidělí Mute roli a zapíše záznam')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('id')
        .setDescription('Uživatel k umlčení')
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt.setName('jednotka')
        .setDescription('Jednotka času nebo perma')
        .setRequired(true)
        .addChoices(
          { name: 'minuty',      value: 'm'     },
          { name: 'hodiny',      value: 'h'     },
          { name: 'dny',         value: 'd'     },
          { name: 'Permanentní', value: 'perma' },
        ),
    )
    .addStringOption(opt =>
      opt.setName('duvod')
        .setDescription('Důvod mute')
        .setRequired(true),
    )
    .addIntegerOption(opt =>
      opt.setName('cas')
        .setDescription('Čas mute (pouze pro minuty/hodiny/dny)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10000),
    ),

  async execute(interaction) {
    if (!await isAnyStaff(interaction.member)) {
      return interaction.reply({
        embeds: [buildErrorEmbed('Nemáš oprávnění k použití tohoto příkazu.')],
        flags:  64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    const target   = interaction.options.getMember('id');
    const cas      = interaction.options.getInteger('cas');
    const jednotka = interaction.options.getString('jednotka');
    const duvod    = interaction.options.getString('duvod');
    const guild    = interaction.guild;

    if (jednotka !== 'perma' && (!Number.isInteger(cas) || cas <= 0)) {
      return interaction.editReply({
        embeds: [buildErrorEmbed('Pro minuty/hodiny/dny musíš vyplnit kladné číslo v poli čas.')],
      });
    }

    if (!target) {
      return interaction.editReply({ embeds: [buildErrorEmbed('Uživatel není na serveru.')] });
    }

    // Nelze mute-ovat staff
    if (await isAnyStaff(target)) {
      return interaction.editReply({ embeds: [buildErrorEmbed('Nelze umlčet člena staffu.')] });
    }

    // Načti mute_role_id z konfigurace bota
    const muteRoleId = await getConfig('mute_role_id');
    if (!muteRoleId) {
      return interaction.editReply({
        embeds: [buildErrorEmbed('Mute role není nakonfigurována. Nastav ji v Managementu → Discord → Obecné.')],
      });
    }

    const muteRole = guild.roles.cache.get(muteRoleId);
    if (!muteRole) {
      return interaction.editReply({ embeds: [buildErrorEmbed(`Role <@&${muteRoleId}> nebyla nalezena.`)] });
    }

    const expiresAt = parseDuration(cas ?? 0, jednotka);
    const trvaniLabel = durationLabel(cas ?? 0, jednotka);
    const discordId = target.user.id;
    const db        = getWebPool();

    try {
      // Přiřaď roli na Discordu
      await target.roles.add(muteRole, `Mute: ${duvod}`);

      // Vyhledej uživatele v web DB podle discord_id
      const [rows] = await db.execute(
        'SELECT id FROM users WHERE discord_id = ? LIMIT 1',
        [discordId],
      );

      if (rows.length > 0) {
        const userId = rows[0].id;

        // Získej interní ID issuera
        const [issuerRows] = await db.execute(
          'SELECT id FROM users WHERE discord_id = ? LIMIT 1',
          [interaction.user.id],
        );
        const issuedBy = issuerRows.length > 0 ? issuerRows[0].id : null;

        await db.execute(
          `INSERT INTO player_mutes
            (user_id, reason, expires_at, issued_by, issued_via, issued_at)
           VALUES (?, ?, ?, ?, 'discord', NOW())`,
          [userId, duvod, expiresAt ?? null, issuedBy],
        );
      }

      // Odpověď pro staff
      const expiryText = expiresAt
        ? moment(expiresAt).format('D. M. YYYY HH:mm')
        : 'Nikdy (permanentní)';

      await interaction.editReply({
        embeds: [buildMuteResponseEmbed({
          userMention: `<@${discordId}>`,
          duration:    trvaniLabel,
          expires:     expiryText,
          reason:      duvod,
          issuer:      `<@${interaction.user.id}>`,
        })],
      });

      // Mod-log
      const modLogId = await getConfig('mod_log_channel');
      if (modLogId) {
        const logCh = guild.channels.cache.get(modLogId);
        if (logCh) {
          await logCh.send({
            embeds: [buildMuteModlogEmbed({
              userTag:    `<@${discordId}> (${target.user.tag})`,
              duration:   trvaniLabel,
              expires:    expiryText,
              reason:     duvod,
              moderator:  `<@${interaction.user.id}>`,
            })],
          });
        }
      }

      // Notifikace samotného uživatele (DM – nekritická)
      try {
        await target.send({
          embeds: [buildMuteDmEmbed({
            duration: trvaniLabel,
            expires:  expiryText,
            reason:   duvod,
          })],
        });
      } catch (_) { /* DM zakázány */ }

      // Pokud není permanentní, naplánuj automatické odmuteování
      if (expiresAt) {
        const ms = expiresAt.getTime() - Date.now();
        if (ms > 0) {
          setTimeout(async () => {
            try {
              const freshMember = await guild.members.fetch(discordId).catch(() => null);
              if (freshMember) await freshMember.roles.remove(muteRole, 'Mute vypršel – automatické odmuteování');

              // Revoke v DB
              const [muteRows] = await db.execute(
                `SELECT id FROM player_mutes
                  WHERE user_id = (SELECT id FROM users WHERE discord_id = ? LIMIT 1)
                    AND revoked = 0
                    AND issued_via = 'discord'
                  ORDER BY issued_at DESC LIMIT 1`,
                [discordId],
              );
              if (muteRows.length > 0) {
                await db.execute(
                  `UPDATE player_mutes
                      SET revoked = 1, revoked_at = NOW(), revoked_reason = 'Automatické odmuteování – vypršení'
                    WHERE id = ?`,
                  [muteRows[0].id],
                );
              }

              if (modLogId) {
                const logCh2 = guild.channels.cache.get(modLogId);
                if (logCh2) {
                  await logCh2.send({
                    embeds: [buildMuteUnmuteEmbed({ userMention: `<@${discordId}>` })],
                  });
                }
              }
            } catch (e) {
              console.error('[mute] auto-unmute error:', e);
            }
          }, ms);
        }
      }

    } catch (err) {
      console.error('[mute] execute error:', err);
      return interaction.editReply({
        embeds: [buildErrorEmbed(`Chyba při udělení mute: ${err.message}`)],
      });
    }
  },
};

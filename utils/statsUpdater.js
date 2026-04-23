'use strict';
const { getConfig } = require('../database');
const config        = require('../config');

async function fetchRedmPlayers(baseUrl) {
  try {
    const url = baseUrl.replace(/\/$/, '') + '/players.json';
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

async function setChannelName(guild, channelId, name) {
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return;
  if (ch.name === name) return; // bez zbytečného API volání
  try {
    await ch.setName(name);
    console.log(`[STATS] Přejmenován kanál ${channelId} → "${name}"`);
  } catch (err) {
    console.warn(`[STATS] Nelze přejmenovat kanál ${channelId}: ${err.message}`);
  }
  // Discord rate limit: max 2 přejmenování / 10 min / kanál — pauza mezi voláními
  await new Promise(r => setTimeout(r, 5000));
}

async function updateStats(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;

  // Fetchni všechny členy (force cache refresh) aby počty byly přesné
  const allMembers = await guild.members.fetch().catch(err => {
    console.error('[STATS] Chyba při fetchování členů:', err.message);
    return guild.members.cache;
  });

  console.log(`[STATS] Fetchnuto ${allMembers.size} členů`);

  // ── Celkový počet členů ────────────────────────────────────────
  const totalChId = await getConfig('stats_channel_total');
  if (totalChId) {
    const fmt = await getConfig('stats_format_total') || '👥 Members: %';
    await setChannelName(guild, totalChId, fmt.replace('%', guild.memberCount));
  }

  // ── Allowlist ──────────────────────────────────────────────────
  const alChId   = await getConfig('stats_channel_al');
  const alRoleId = await getConfig('stats_role_al');
  if (alChId && alRoleId) {
    const count = allMembers.filter(m => m.roles.cache.has(alRoleId)).size;
    console.log(`[STATS] AL role ${alRoleId}: ${count} členů`);
    const fmt = await getConfig('stats_format_al') || '✅ Allowlisted: %';
    await setChannelName(guild, alChId, fmt.replace('%', count));
  }

  // ── Čeká na pohovor ────────────────────────────────────────────
  const intChId   = await getConfig('stats_channel_interview');
  const intRoleId = await getConfig('stats_role_interview');
  if (intChId && intRoleId) {
    const count = allMembers.filter(m => m.roles.cache.has(intRoleId)).size;
    console.log(`[STATS] Interview role ${intRoleId}: ${count} členů`);
    const fmt = await getConfig('stats_format_interview') || '🎤 Pohovor: %';
    await setChannelName(guild, intChId, fmt.replace('%', count));
  }

  // ── Online na herním serveru (RedM) ───────────────────────────────
  const redmChId = await getConfig('stats_channel_redm');
  const redmUrl  = await getConfig('stats_redm_url');
  if (redmChId && redmUrl) {
    const count = await fetchRedmPlayers(redmUrl);
    console.log(`[STATS] RedM online: ${count}`);
    if (count !== null) {
      const fmt = await getConfig('stats_format_redm') || '🎮 Online: %/64';
      await setChannelName(guild, redmChId, fmt.replace('%', count));
    }
  }
}

module.exports = { updateStats };

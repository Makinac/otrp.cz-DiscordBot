'use strict';
const { Events } = require('discord.js');

module.exports = {
  name: Events.InviteCreate,
  once: false,

  execute(invite, client) {
    const cache = client.inviteCache?.get(invite.guild?.id);
    if (cache) cache.set(invite.code, invite.uses ?? 0);
  },
};

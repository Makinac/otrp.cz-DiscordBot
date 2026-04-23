'use strict';
const { Events } = require('discord.js');

module.exports = {
  name: Events.InviteDelete,
  once: false,

  execute(invite, client) {
    const cache = client.inviteCache?.get(invite.guild?.id);
    if (cache) cache.delete(invite.code);
  },
};

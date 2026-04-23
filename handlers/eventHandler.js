'use strict';
const fs   = require('fs');
const path = require('path');

/**
 * Načte všechny event handlery z events/ a zaregistruje je na klientovi.
 * @param {import('discord.js').Client} client
 */
function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const files = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
  let count = 0;

  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    if (!event.name || typeof event.execute !== 'function') {
      console.warn(`[EVT] Přeskočen ${file} – chybí name nebo execute`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    count++;
  }

  console.log(`[EVT] Načteno ${count} event handlerů.`);
}

module.exports = { loadEvents };

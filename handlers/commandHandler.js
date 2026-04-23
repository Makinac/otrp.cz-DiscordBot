'use strict';
const fs   = require('fs');
const path = require('path');

/**
 * Načte všechny slash příkazy z commands/ a registruje je do client.commands.
 * @param {import('discord.js').Client} client
 */
function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  let count = 0;

  function readDir(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        readDir(fullPath);
      } else if (item.name.endsWith('.js')) {
        const command = require(fullPath);
        if (command.data && typeof command.execute === 'function') {
          client.commands.set(command.data.name, command);
          count++;
        } else {
          console.warn(`[CMD] Přeskočen ${item.name} – chybí data nebo execute`);
        }
      }
    }
  }

  readDir(commandsPath);
  console.log(`[CMD] Načteno ${count} příkazů.`);
}

module.exports = { loadCommands };

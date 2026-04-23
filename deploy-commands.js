'use strict';
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];

function readCommands(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      readCommands(fullPath);
    } else if (item.name.endsWith('.js')) {
      const cmd = require(fullPath);
      if (cmd.data) {
        commands.push(cmd.data.toJSON());
        console.log(`  ✓ ${cmd.data.name}`);
      }
    }
  }
}

console.log('Načítám příkazy...');
readCommands(path.join(__dirname, 'commands'));

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log(`\nRegistruji ${commands.length} příkaz(ů) na serveru ${config.guildId}...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );
    console.log(`✅ Úspěšně zaregistrováno ${data.length} příkazů!`);
  } catch (err) {
    console.error('❌ Chyba při registraci příkazů:', err);
    process.exit(1);
  }
})();

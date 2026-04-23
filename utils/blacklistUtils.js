'use strict';
const { stmts } = require('../database');
const config    = require('../config');
const moment    = require('moment');

/** Inicializace výchozího blacklistu z config.js */
async function initBlacklist() {
  const allRows = await stmts.getBlacklist.all();
  const existing = allRows.map(r => r.domain);
  let added = 0;
  for (const domain of config.defaultBlacklist) {
    if (!existing.includes(domain)) {
      await stmts.addBlacklist.run(domain, 'SYSTEM', moment().toISOString());
      added++;
    }
  }
  if (added > 0) {
    console.log(`[BLACKLIST] Přidáno ${added} výchozích domén do blacklistu.`);
  }
}

/**
 * Zkontroluje zprávu na blacklistované domény.
 * Vrátí první nalezenou zakázanou doménu nebo null.
 * @param {string} content
 * @returns {string|null}
 */
async function checkBlacklist(content) {
  // Extrahuj všechny URL-like řetězce ze zprávy
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
  let match;
  while ((match = urlPattern.exec(content.toLowerCase())) !== null) {
    // Extrahuj hostname (odeber www. prefix a cesty)
    let domain = match[1] || match[0];
    // Zjisti root domain (např. z 'sub.pornhub.com' → 'pornhub.com')
    const parts = domain.split('.');
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join('.');
      if (await stmts.isBlacklisted.get(rootDomain)) {
        return rootDomain;
      }
      // Zkontroluj i plnou doménu
      if (await stmts.isBlacklisted.get(domain)) {
        return domain;
      }
    }
  }
  return null;
}

module.exports = { initBlacklist, checkBlacklist };

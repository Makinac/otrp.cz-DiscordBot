'use strict';
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getConfig } = require('../database');

async function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const dbRoles = await getConfig('staff_roles_vedeni');
  const roleIds = dbRoles
    ? dbRoles.split(',').map(s => s.trim()).filter(Boolean)
    : config.ticketStaffRoles.vedeni || [];
  return roleIds.some(id => member.roles.cache.has(id));
}

async function isStaffForCategory(member, category) {
  if (await isAdmin(member)) return true;
  const dbRoles = await getConfig(`staff_roles_${category}`);
  const roleIds = dbRoles
    ? dbRoles.split(',').map(s => s.trim()).filter(Boolean)
    : config.ticketStaffRoles[category] || [];
  return roleIds.some(id => member.roles.cache.has(id));
}

async function isAnyStaff(member) {
  if (await isAdmin(member)) return true;
  for (const cat of ['admin', 'dev', 'faction', 'vedeni']) {
    if (await isStaffForCategory(member, cat)) return true;
  }
  return false;
}

module.exports = { isAdmin, isStaffForCategory, isAnyStaff };

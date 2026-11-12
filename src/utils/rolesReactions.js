/**
 * Les ROLES-REACTIONS : un panneau avec des boutons (ou un menu deroulant),
 * « clique pour recevoir le role ». Pour les couleurs, les notifications, les
 * jeux, les pronoms...
 *
 * Deux modes :
 *   - boutons : un clic donne le role, un second clic le retire ;
 *   - menu    : un menu deroulant, la selection remplace la precedente.
 * Et une option « unique » : un seul role du panneau a la fois (couleurs).
 *
 * Chaque panneau est en base (menus_roles) : le bot sait toujours a quels
 * roles un bouton correspond, meme apres un redemarrage, et refuse un role
 * qui aurait ete retire du panneau entre-temps.
 *
 * Identifiants de composants : rr_b:<menu>:<role> (bouton), rr_m:<menu> (menu).
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const conf = require('../../config');
const { db } = require('../database/db');
const C = require('./composants');
const logger = require('./logger');
const { traducteur } = require('./langues');

db.exec(`
CREATE TABLE IF NOT EXISTS menus_roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  message_id  TEXT,
  titre       TEXT NOT NULL,
  description TEXT,
  mode        TEXT NOT NULL DEFAULT 'boutons',
  unique_role INTEGER NOT NULL DEFAULT 0,
  roles       TEXT NOT NULL DEFAULT '[]',   -- JSON [{ role_id, emoji, label }]
  cree_le     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_menus_roles_guild ON menus_roles (guild_id);
`);

const q = {
  creer: db.prepare(`
    INSERT INTO menus_roles (guild_id, channel_id, titre, description, mode, unique_role, roles, cree_le)
    VALUES (@guild_id, @channel_id, @titre, @description, @mode, @unique_role, @roles, @cree_le)
  `),
  lire: db.prepare('SELECT * FROM menus_roles WHERE id = ? AND guild_id = ?'),
  duServeur: db.prepare('SELECT * FROM menus_roles WHERE guild_id = ? ORDER BY id'),
  message: db.prepare('UPDATE menus_roles SET message_id = ?, channel_id = ? WHERE id = ?'),
  roles: db.prepare('UPDATE menus_roles SET roles = ? WHERE id = ?'),
  supprimer: db.prepare('DELETE FROM menus_roles WHERE id = ? AND guild_id = ?'),
  compter: db.prepare('SELECT COUNT(*) AS n FROM menus_roles WHERE guild_id = ?'),
};

const MAX_ROLES = 25;
const MAX_MENUS = 25;

function roles(menu) {
  try {
    return JSON.parse(menu.roles ?? '[]');
  } catch {
    return [];
  }
}

/** Un emoji tel que Discord l'attend dans un bouton : unicode ou <:nom:id>. */
function emojiValide(texte) {
  if (!texte) return null;
  const t = texte.trim();
  const perso = t.match(/^<a?:(\w{2,32}):(\d{17,20})>$/);
  if (perso) return { id: perso[2], name: perso[1], animated: t.startsWith('<a:') };
  // Un emoji unicode : court, sans lettres ni chiffres ASCII.
  if (t.length <= 8 && !/[a-z0-9]/i.test(t)) return t;
  return null;
}

/** Le message du panneau. */
function construire(menu, guild) {
  const { t } = traducteur(guild);
  const liste = roles(menu).filter((r) => guild.roles.cache.has(r.role_id));

  const lignes = liste.map((r) => `${r.emoji ? `${r.emoji} ` : '• '}<@&${r.role_id}>${r.label ? ` — ${r.label}` : ''}`);
  const elements = [
    C.texte(`## ${menu.titre}${menu.description ? `\n${menu.description}` : ''}`),
    lignes.length ? C.separateur() : null,
    lignes.length ? C.texte(lignes.join('\n')) : C.texte(`-# ${t('rr.vide')}`),
  ];

  if (liste.length && menu.mode === 'menu') {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`rr_m:${menu.id}`)
      .setPlaceholder(t(menu.unique_role ? 'rr.menu_unique' : 'rr.menu_plusieurs'))
      .setMinValues(0)
      .setMaxValues(menu.unique_role ? 1 : liste.length)
      .addOptions(liste.map((r) => {
        const role = guild.roles.cache.get(r.role_id);
        const option = { label: (r.label || role.name).slice(0, 100), value: r.role_id };
        const e = emojiValide(r.emoji);
        if (e) option.emoji = e;
        return option;
      }));
    elements.push(new ActionRowBuilder().addComponents(select));
  } else if (liste.length) {
    for (let i = 0; i < liste.length; i += 5) {
      elements.push(new ActionRowBuilder().addComponents(liste.slice(i, i + 5).map((r) => {
        const role = guild.roles.cache.get(r.role_id);
        const b = new ButtonBuilder()
          .setCustomId(`rr_b:${menu.id}:${r.role_id}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel((r.label || role.name).slice(0, 80));
        const e = emojiValide(r.emoji);
        if (e) b.setEmoji(e);
        return b;
      })));
    }
  }
  elements.push(C.texte(`-# ${t(menu.unique_role ? 'rr.pied_unique' : 'rr.pied')}`));
  return C.envoi([C.conteneur(elements, conf.couleurs.principale)], { allowedMentions: { parse: [] } });
}

/** Remet a jour le message publie (apres un ajout ou un retrait de role). */
async function rafraichir(menu, guild) {
  const salon = guild.channels.cache.get(menu.channel_id);
  if (!salon || !menu.message_id) return false;
  const message = await salon.messages.fetch(menu.message_id).catch(() => null);
  if (!message) return false;
  await message.edit(construire(menu, guild));
  return true;
}

// --------------------------------------------------------------- CLICS
async function gererInteraction(interaction) {
  const { t } = traducteur(interaction);
  const [prefixe, idMenu, idRole] = interaction.customId.split(':');
  const menu = q.lire.get(Number(idMenu), interaction.guild.id);
  if (!menu) return interaction.reply(C.erreurPrivee(t('rr.menu_disparu')));

  const liste = roles(menu).filter((r) => interaction.guild.roles.cache.has(r.role_id));
  const ids = liste.map((r) => r.role_id);
  const membre = interaction.member;

  try {
    // ------------------------------------------------------------ BOUTON
    if (prefixe === 'rr_b') {
      if (!ids.includes(idRole)) return interaction.reply(C.erreurPrivee(t('rr.role_retire')));
      const role = interaction.guild.roles.cache.get(idRole);
      if (!role.editable) return interaction.reply(C.erreurPrivee(t('rr.role_trop_haut', { role: `${role}` })));

      if (membre.roles.cache.has(role.id)) {
        await membre.roles.remove(role, 'Rôles-réactions');
        return interaction.reply(C.infoPrivee(t('rr.retire', { role: `${role}` })));
      }
      // Mode unique : on enleve les autres roles du panneau.
      const autres = menu.unique_role ? ids.filter((id) => id !== role.id && membre.roles.cache.has(id)) : [];
      if (autres.length) await membre.roles.remove(autres, 'Rôles-réactions (un seul à la fois)');
      await membre.roles.add(role, 'Rôles-réactions');
      return interaction.reply(C.succesPrive(t(autres.length ? 'rr.remplace' : 'rr.ajoute', { role: `${role}` })));
    }

    // -------------------------------------------------------------- MENU
    const voulus = new Set(interaction.values.filter((v) => ids.includes(v)));
    const ajouter = [...voulus].filter((id) => !membre.roles.cache.has(id) && interaction.guild.roles.cache.get(id)?.editable);
    const retirer = ids.filter((id) => !voulus.has(id) && membre.roles.cache.has(id) && interaction.guild.roles.cache.get(id)?.editable);
    if (retirer.length) await membre.roles.remove(retirer, 'Rôles-réactions');
    if (ajouter.length) await membre.roles.add(ajouter, 'Rôles-réactions');

    const morceaux = [];
    if (ajouter.length) morceaux.push(t('rr.menu_ajoutes', { roles: ajouter.map((id) => `<@&${id}>`).join(' ') }));
    if (retirer.length) morceaux.push(t('rr.menu_retires', { roles: retirer.map((id) => `<@&${id}>`).join(' ') }));
    // Le menu garde la selection a l'ecran : on le remet a zero.
    await interaction.message.edit(construire(menu, interaction.guild)).catch(() => null);
    return interaction.reply(C.succesPrive(morceaux.join('\n') || t('rr.rien_change')));
  } catch (e) {
    logger.avertissement('Rôles-réactions :', e.message);
    return interaction.reply(C.erreurPrivee(t('rr.impossible', { erreur: e.message }))).catch(() => null);
  }
}

module.exports = { q, roles, construire, rafraichir, gererInteraction, emojiValide, MAX_ROLES, MAX_MENUS };

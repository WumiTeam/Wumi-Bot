/**
 * /note — notes privees du staff sur un membre.
 *
 * Ce n'est PAS une sanction : le membre n'est pas prevenu, rien n'apparait
 * dans son historique de sanctions. C'est le carnet de l'equipe : « deja
 * prevenu oralement », « a l'air d'etre le double compte de X », « a aide
 * pendant le raid »...
 *
 * Les notes partent avec le serveur (colonne guild_id) mais PAS quand le
 * membre efface ses donnees avec /confidentialite : comme les sanctions,
 * elles decrivent le travail de moderation, pas le membre.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const { db } = require('../../database/db');
const C = require('../../utils/composants');
const { ts, tronquer } = require('../../utils/outils');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

db.exec(`
CREATE TABLE IF NOT EXISTS mod_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  auteur_id  TEXT NOT NULL,
  texte      TEXT NOT NULL,
  date       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mod_notes_membre ON mod_notes (guild_id, user_id);
`);

const q = {
  ajouter: db.prepare('INSERT INTO mod_notes (guild_id, user_id, auteur_id, texte, date) VALUES (?, ?, ?, ?, ?)'),
  de: db.prepare('SELECT * FROM mod_notes WHERE guild_id = ? AND user_id = ? ORDER BY date DESC'),
  compter: db.prepare('SELECT COUNT(*) AS n FROM mod_notes WHERE guild_id = ? AND user_id = ?'),
  parId: db.prepare('SELECT * FROM mod_notes WHERE id = ? AND guild_id = ?'),
  retirer: db.prepare('DELETE FROM mod_notes WHERE id = ? AND guild_id = ?'),
};

const MAX_PAR_MEMBRE = 50;

const optionMembre = (o) => o
  .setName('member')
  .setNameLocalizations({ fr: 'membre' })
  .setDescription(tr('note.opt_membre', DEFAUT))
  .setDescriptionLocalizations(localisations('note.opt_membre'))
  .setRequired(true);

module.exports = {
  categorie: 'moderation',
  requetes: q,

  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription(tr('note.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('note.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('add')
      .setNameLocalizations({ fr: 'ajouter' })
      .setDescription(tr('note.sous_ajouter', DEFAUT))
      .setDescriptionLocalizations(localisations('note.sous_ajouter'))
      .addUserOption(optionMembre)
      .addStringOption((o) => o
        .setName('text')
        .setNameLocalizations({ fr: 'texte' })
        .setDescription(tr('note.opt_texte', DEFAUT))
        .setDescriptionLocalizations(localisations('note.opt_texte'))
        .setRequired(true)
        .setMaxLength(800)))
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('note.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('note.sous_liste'))
      .addUserOption(optionMembre))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('note.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('note.sous_retirer'))
      .addIntegerOption((o) => o
        .setName('id')
        .setDescription(tr('note.opt_id', DEFAUT))
        .setDescriptionLocalizations(localisations('note.opt_id'))
        .setRequired(true)
        .setMinValue(1))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sous === 'add') {
      const cible = interaction.options.getUser('member');
      const texte = interaction.options.getString('text');
      if (q.compter.get(guildId, cible.id).n >= MAX_PAR_MEMBRE) {
        return interaction.reply(C.erreurPrivee(t('note.trop', { max: MAX_PAR_MEMBRE })));
      }
      const r = q.ajouter.run(guildId, cible.id, interaction.user.id, texte, Date.now());
      return interaction.reply(C.succesPrive(t('note.ajoutee', { membre: `${cible}`, n: Number(r.lastInsertRowid) })));
    }

    if (sous === 'remove') {
      const id = interaction.options.getInteger('id');
      const note = q.parId.get(id, guildId);
      if (!note) return interaction.reply(C.erreurPrivee(t('note.introuvable', { n: id })));
      // Seuls l'auteur et les administrateurs effacent une note.
      if (note.auteur_id !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('note.pas_ta_note')));
      }
      q.retirer.run(id, guildId);
      return interaction.reply(C.succesPrive(t('note.retiree', { n: id })));
    }

    // liste
    const cible = interaction.options.getUser('member');
    const notes = q.de.all(guildId, cible.id);
    if (!notes.length) return interaction.reply(C.infoPrivee(t('note.vide', { membre: cible.username })));

    const lignes = notes.slice(0, 15).map((n) => `\`#${n.id}\` · <@${n.auteur_id}> · ${ts(n.date, 'R')}\n> ${tronquer(n.texte, 300).replace(/\n/g, '\n> ')}`);
    return interaction.reply(C.envoiPrive([C.conteneur([
      C.sectionVignette(`## 📝 ${t('note.titre', { membre: cible.username })}\n${t('note.sous_titre', { n: notes.length })}`, cible.displayAvatarURL()),
      C.separateur(),
      C.texte(tronquer(lignes.join('\n\n'), C.MAX_TEXTE)),
      notes.length > 15 ? C.texte(`-# ${t('note.plus', { n: notes.length - 15 })}`) : null,
    ], conf.couleurs.info)]));
  },
};

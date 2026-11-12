/**
 * La verification des serveurs (pas du support : celle-la est dans
 * verificationSupport.js). Un bouton, et en option un petit calcul.
 *
 * Wumi 2.0 : panneau en Components V2, tout traduit (cles verif.*), log
 * dans la langue du serveur. Les identifiants de composants n'ont PAS change
 * (verif_valider, verif_modal) : les panneaux deja publies marchent toujours.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const conf = require('../../config');
const { config } = require('../database/db');
const C = require('./composants');
const { ts } = require('./outils');
const { envoyerLog } = require('./logs');
const logger = require('./logger');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

/** Calculs en attente : cle `${guildId}-${userId}` -> { reponse, expire }. */
const enigmes = new Map();

/** Le panneau de verification, en V2. */
function construirePanneau(guild) {
  const { t } = traducteur(guild);
  const cfg = config(guild.id);
  const role = cfg.verif_role ? `<@&${cfg.verif_role}>` : null;

  return C.envoi([C.conteneur([
    C.texte(`## ${cfg.verif_titre || `${E('securite')} ${t('verif.titre')}`}\n${cfg.verif_message || t('verif.message')}`),
    role ? C.texte(`-# ${t('verif.role_donne', { role })}`) : null,
    new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId('verif_valider')
      .setLabel((cfg.verif_bouton || t('verif.bouton')).slice(0, 80))
      .setEmoji(E('succes'))
      .setStyle(ButtonStyle.Success)),
    C.texte(`-# ${guild.name}`),
  ], conf.couleurs.principale)], { allowedMentions: { parse: [] } });
}

/** Une addition simple et la fenetre qui la pose. */
function construireEnigme(interaction) {
  const { t } = traducteur(interaction);
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  enigmes.set(`${interaction.guild.id}-${interaction.user.id}`, { reponse: String(a + b), expire: Date.now() + 5 * 60_000 });

  return new ModalBuilder()
    .setCustomId('verif_modal')
    .setTitle(t('verif.modal_titre').slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('reponse')
      .setLabel(t('verif.modal_question', { a, b }).slice(0, 45))
      .setPlaceholder(t('verif.modal_aide').slice(0, 100))
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(3)
      .setRequired(true)));
}

/** Attribue le role de verification. Renvoie { ok, role } ou { ok:false, cle, variables }. */
async function attribuerRole(interaction) {
  const { t } = traducteur(interaction);
  const cfg = config(interaction.guild.id);
  const role = interaction.guild.roles.cache.get(cfg.verif_role);

  if (!role) return { ok: false, cle: 'verif.role_disparu' };
  if (interaction.member.roles.cache.has(role.id)) return { ok: false, cle: 'verif.deja' };
  if (!role.editable) return { ok: false, cle: 'verif.role_trop_haut' };

  try {
    await interaction.member.roles.add(role, t('verif.audit'));
  } catch (e) {
    return { ok: false, cle: 'verif.impossible', variables: { erreur: e.message } };
  }

  await envoyerLog(interaction.guild, 'membres', {
    color: conf.couleurs.succes,
    author: { name: t('verif.log_titre', { membre: interaction.user.username }), icon_url: interaction.user.displayAvatarURL() || undefined },
    description: t('verif.log_texte', { membre: `${interaction.user}`, role: `${role}`, quand: ts(interaction.user.createdTimestamp, 'R') }),
    timestamp: new Date().toISOString(),
  });
  return { ok: true, role };
}

// -------------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  const { t } = traducteur(interaction);
  try {
    const cfg = config(interaction.guild.id);

    if (interaction.isButton() && interaction.customId === 'verif_valider') {
      if (!cfg.verif_actif || !cfg.verif_role) return interaction.reply(C.erreurPrivee(t('verif.pas_configuree')));
      if (interaction.member.roles.cache.has(cfg.verif_role)) return interaction.reply(C.infoPrivee(t('verif.deja')));
      if (cfg.verif_captcha) return interaction.showModal(construireEnigme(interaction));

      const res = await attribuerRole(interaction);
      return interaction.reply(res.ok
        ? C.succesPrive(t('verif.bienvenue', { role: `${res.role}` }))
        : C.erreurPrivee(t(res.cle, res.variables)));
    }

    if (interaction.isModalSubmit() && interaction.customId === 'verif_modal') {
      const cle = `${interaction.guild.id}-${interaction.user.id}`;
      const enigme = enigmes.get(cle);
      const saisie = interaction.fields.getTextInputValue('reponse').trim();
      enigmes.delete(cle);

      if (!enigme || enigme.expire < Date.now()) return interaction.reply(C.avertissementPrivee(t('verif.expire')));
      if (saisie !== enigme.reponse) return interaction.reply(C.erreurPrivee(t('verif.faux')));

      const res = await attribuerRole(interaction);
      return interaction.reply(res.ok
        ? C.succesPrive(t('verif.reussi', { role: `${res.role}` }))
        : C.erreurPrivee(t(res.cle, res.variables)));
    }
  } catch (e) {
    logger.erreur('Interaction vérification :', e);
    const r = C.erreurPrivee(t('verif.erreur'));
    if (interaction.replied || interaction.deferred) await interaction.followUp(r).catch(() => null);
    else await interaction.reply(r).catch(() => null);
  }
  return null;
}

// Menage des calculs abandonnes.
setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, e] of enigmes) if (e.expire < maintenant) enigmes.delete(cle);
}, 10 * 60_000).unref?.();

module.exports = { construirePanneau, construireEnigme, attribuerRole, gererInteraction, enigmes };

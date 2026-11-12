const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const { config } = require('../../database/db');
const banque = require('../../utils/banque');
const eco = require('../../utils/economie');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const V = conf.economie.braquage;

// src/utils/banque.js#braquer rend une `raison` en français fige (hors de ce
// lot, on ne la modifie pas) — sauf le cas special `'attente'`, deja gere a
// part par l'appelant. On traduit donc ici l'ensemble fini des autres refus.
function texteRefus(t, nombre, raison) {
  if (raison === 'Tu ne peux pas te braquer toi-meme.') return t('braquer.soi_meme');
  if (raison === 'Cette personne a un coffre-fort actif : impossible de la braquer.') return t('braquer.protege');
  if (raison.startsWith('Cette personne a moins de')) {
    return t('braquer.cible_fauchee', { minimum: nombre(V.soldeMinimumCible ?? 500) });
  }
  if (raison === "Tu n'as pas de quoi payer l'amende si tu echoues. Reviens avec un peu d'avance.") {
    return t('braquer.pas_d_avance');
  }
  return t('braquer.refus_inconnu');
}

module.exports = {
  categorie: 'economie',

  data: new SlashCommandBuilder()
    .setName('rob')
    .setNameLocalizations({ fr: 'braquer' })
    .setDescription(tr('braquer.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('braquer.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('braquer.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('braquer.opt_membre'))
      .setRequired(true)),

  async execute(interaction) {
    const { t, nombre, duree } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const cfg = config(guildId);

    if (!cfg.eco_actif || !cfg.braquage_actif) {
      return interaction.reply(C.avertissementPrivee(t('braquer.desactive')));
    }

    const cible = interaction.options.getUser('member');
    if (cible.bot) {
      return interaction.reply(C.erreurPrivee(t('braquer.bots')));
    }

    const r = banque.braquer(guildId, interaction.user.id, cible.id);

    if (!r.ok) {
      if (r.raison === 'attente') {
        return interaction.reply(C.infoPrivee(t('braquer.attente', { duree: duree(r.resteMs) })));
      }
      return interaction.reply(C.erreurPrivee(texteRefus(t, nombre, r.raison)));
    }

    if (r.reussi) {
      return interaction.reply(C.envoi([
        C.conteneur([
          C.texte(`## ${E('piece')} ${t('braquer.reussi_titre')}`),
          C.texte(
            `${t('braquer.reussi', { voleur: interaction.user.id, cible: cible.id, somme: eco.somme(guildId, r.butin) })}\n\n`
            + `*${t('braquer.conseil')}*`
          ),
          C.texte(`-# ${t('braquer.prochaine', { n: nombre(V.delaiHeures) })}`),
        ], conf.couleurs.succes),
      ]));
    }

    return interaction.reply(C.envoi([
      C.conteneur([
        C.texte(`## ${E('alerte')} ${t('braquer.rate_titre')}`),
        C.texte(
          `${t('braquer.rate', { voleur: interaction.user.id, cible: cible.id })}\n`
          + t('braquer.amende', { somme: eco.somme(guildId, r.amende) })
        ),
        C.texte(`-# ${t('braquer.prochaine', { n: nombre(V.delaiHeures) })}`),
      ], conf.couleurs.erreur),
    ]));
  },
};

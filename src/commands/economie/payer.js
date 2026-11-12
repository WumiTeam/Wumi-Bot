const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const { config } = require('../../database/db');
const banque = require('../../utils/banque');
const eco = require('../../utils/economie');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// src/utils/banque.js#payer rend une `raison` en français fige quand elle
// refuse un envoi. On ne touche pas cet utilitaire partage (hors de ce lot) :
// on reconnait ici l'ensemble fini de ce qu'il peut renvoyer.
const P = conf.economie?.paiement ?? {};

function texteRefus(t, nombre, raison) {
  if (raison === "Tu ne peux pas te payer toi-meme.") return t('payer.soi_meme');
  if (raison === "Tu n'as pas cette somme en poche.") return t('payer.pas_en_poche');
  if (raison.startsWith('Le minimum est de')) return t('payer.minimum', { n: nombre(P.minimum ?? 1) });
  if (raison.startsWith('Le maximum est de')) return t('payer.maximum', { n: nombre(P.maximum ?? 1_000_000) });
  return t('payer.refus_inconnu');
}

module.exports = {
  categorie: 'economie',

  data: new SlashCommandBuilder()
    .setName('pay')
    .setNameLocalizations({ fr: 'payer' })
    .setDescription(tr('payer.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('payer.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('payer.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('payer.opt_membre'))
      .setRequired(true))
    .addIntegerOption((o) => o
      .setName('amount')
      .setNameLocalizations({ fr: 'montant' })
      .setDescription(tr('payer.opt_montant', DEFAUT))
      .setDescriptionLocalizations(localisations('payer.opt_montant'))
      .setRequired(true)
      .setMinValue(conf.economie.paiement.minimum)
      .setMaxValue(conf.economie.paiement.maximum)),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const cfg = config(guildId);

    if (!cfg.eco_actif || !cfg.paye_actif) {
      return interaction.reply(C.avertissementPrivee(t('payer.desactive')));
    }

    const cible = interaction.options.getUser('member');
    if (cible.bot) {
      return interaction.reply(C.erreurPrivee(t('payer.bots')));
    }

    const montant = interaction.options.getInteger('amount');
    const r = banque.payer(guildId, interaction.user.id, cible.id, montant);
    if (!r.ok) return interaction.reply(C.erreurPrivee(texteRefus(t, nombre, r.raison)));

    const detail = r.taxe
      ? `\n${t('payer.taxe', { somme: eco.somme(guildId, r.taxe), pourcent: nombre(conf.economie.paiement.taxePourcent) })}`
      : '';

    // Wumi 2.17 : recu de virement, avatar du destinataire en vignette.
    const m = eco.monnaie(guildId);
    return interaction.reply(C.envoi([C.conteneur([
      C.sectionVignette(
        `## ${m.emoji} +${nombre(r.recu)} ${m.nom}\n${t('payer.fait', { de: interaction.user.id, somme: eco.somme(guildId, r.recu), vers: cible.id })}${detail}`,
        cible.displayAvatarURL({ extension: 'png', size: 128 })
      ),
      C.separateur(),
      C.texte(`-# ${t('payer.reste', { somme: eco.somme(guildId, eco.solde(guildId, interaction.user.id)) })}`),
    ], 0xf8bd2c)]));
  },
};

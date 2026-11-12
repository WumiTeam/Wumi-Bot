const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const { config } = require('../../database/db');
const banque = require('../../utils/banque');
const eco = require('../../utils/economie');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Meme reglages que src/utils/banque.js : on les relit ici pour traduire les
// raisons de refus, qui sortent de l'utilitaire en français fige (voir plus
// bas). On ne DUPLIQUE pas la regle metier, on relit juste le meme reglage.
const B = conf.economie?.banque ?? {};

/**
 * `banque.deposer` / `banque.retirer` rendent une `raison` en français en
 * dur — c'est un utilitaire partage (src/utils/banque.js), hors de ce lot,
 * qu'on ne doit pas toucher. On la traduit donc ICI, au point d'appel,
 * en reconnaissant l'ensemble fini des raisons que chaque fonction peut
 * renvoyer plutot qu'en reparsant son texte.
 */
function texteRefusDepot(t, nombre, raison) {
  if (raison === "Tu n'as pas cette somme en poche.") return t('banque.pas_en_poche');
  return t('banque.depot_minimum', { minimum: nombre(B.depotMinimum ?? 1) });
}

function texteRefusRetrait(t, raison) {
  if (raison === 'Tu n\'as pas cette somme a la banque.') return t('banque.pas_en_banque');
  if (raison === 'Montant invalide.') return t('banque.montant_invalide');
  return t('banque.refus_inconnu');
}

function texteRefusInterets(t, raison) {
  if (raison === 'Rien a la banque.') return t('banque.rien_en_banque');
  if (raison === 'Somme trop faible pour produire des interets.') return t('banque.trop_faible');
  return t('banque.refus_inconnu');
}

module.exports = {
  categorie: 'economie',

  data: new SlashCommandBuilder()
    .setName('bank')
    .setNameLocalizations({ fr: 'banque' })
    .setDescription(tr('banque.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('banque.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('banque.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('banque.sous_voir')))
    .addSubcommand((s) => s
      .setName('deposit')
      .setNameLocalizations({ fr: 'deposer' })
      .setDescription(tr('banque.sous_deposer', DEFAUT))
      .setDescriptionLocalizations(localisations('banque.sous_deposer'))
      .addStringOption((o) => o
        .setName('amount')
        .setNameLocalizations({ fr: 'montant' })
        .setDescription(tr('banque.opt_montant', DEFAUT))
        .setDescriptionLocalizations(localisations('banque.opt_montant'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('withdraw')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('banque.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('banque.sous_retirer'))
      .addStringOption((o) => o
        .setName('amount')
        .setNameLocalizations({ fr: 'montant' })
        .setDescription(tr('banque.opt_montant', DEFAUT))
        .setDescriptionLocalizations(localisations('banque.opt_montant'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('interest')
      .setNameLocalizations({ fr: 'interets' })
      .setDescription(tr('banque.sous_interets', DEFAUT))
      .setDescriptionLocalizations(localisations('banque.sous_interets'))),

  async execute(interaction) {
    const { t, nombre, duree } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const cfg = config(guildId);

    if (!cfg.eco_actif || !cfg.banque_actif) {
      return interaction.reply(C.avertissementPrivee(t('banque.desactivee')));
    }

    const sous = interaction.options.getSubcommand();
    const m = eco.monnaie(guildId);
    const f = banque.fortune(guildId, userId);

    /**
     * Accepte un nombre ou le mot "tout" (les deux langues acceptent "all"/"tout").
     *
     * Le `?? ''` n'est pas de la superstition : l'option est obligatoire sur
     * `deposit` et `withdraw`, donc Discord la fournit toujours — mais cette
     * fonction est definie pour TOUTES les sous-commandes. Le jour ou on
     * l'appelle depuis une branche qui n'a pas d'option `amount`, sans ce
     * repli la commande plante avec « Une erreur est survenue », au lieu de
     * repondre poliment que le montant est invalide.
     */
    const lireMontant = (disponible) => {
      const brut = (interaction.options.getString('amount') ?? '').trim().toLowerCase();
      if (['tout', 'all', 'max'].includes(brut)) return disponible;
      const n = Math.floor(Number(brut.replace(/[\s,]/g, '')));
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    // ---------------------------------------------------------------- VIEW
    if (sous === 'view') {
      const taux = Math.round((conf.economie.banque.tauxJournalier ?? 0) * 100);
      const gainJour = Math.min(Math.floor(f.banque * (conf.economie.banque.tauxJournalier ?? 0)), conf.economie.banque.plafondInterets);
      // Consulter le compte verse aussi les interets s'ils sont dus — c'est
      // le comportement d'origine, on ne le change pas.
      const etat = banque.verserInterets(guildId, userId);

      const ligneInterets = etat.ok
        ? t('banque.interets_verses', { somme: eco.somme(guildId, etat.interets) })
        : etat.resteMs
          ? t('banque.interets_prochains', { duree: duree(etat.resteMs), somme: eco.somme(guildId, gainJour) })
          : t('banque.interets_depose');

      // Wumi 2.17 : la carte portefeuille (poche, banque, fortune), puis les interets.
      await interaction.deferReply();
      const { vueSolde } = require('./economie').vues();
      const vue = await vueSolde(interaction, interaction.user);
      const cadre = vue.components[0];
      cadre.spliceComponents(cadre.components.length - 1, 0,
        C.separateur(),
        C.texte(`### ${E('banque') || E('piece')} ${t('banque.interets_titre', { taux: nombre(taux) })}\n${ligneInterets}\n-# ${t('banque.abri')}`));
      return interaction.editReply(vue);
    }

    // ------------------------------------------------------------ INTEREST
    if (sous === 'interest') {
      const r = banque.verserInterets(guildId, userId);
      if (!r.ok) {
        const contenu = r.resteMs
          ? t('banque.interets_attente', { duree: duree(r.resteMs) })
          : texteRefusInterets(t, r.raison);
        return interaction.reply(C.infoPrivee(contenu));
      }
      const detail = r.jours > 1 ? ` ${t('banque.interets_jours', { n: r.jours })}` : '';
      return interaction.reply(C.succes(
        `${t('banque.interets_fait', { somme: eco.somme(guildId, r.interets), detail })}\n`
        + t('banque.compte_atteint', { somme: eco.somme(guildId, r.banque) })
      ));
    }

    // -------------------------------------------------- DEPOSIT / WITHDRAW
    const depot = sous === 'deposit';
    const montant = lireMontant(depot ? f.poche : f.banque);
    if (!montant) {
      return interaction.reply(C.erreurPrivee(t('banque.saisie_invalide')));
    }

    const r = depot ? banque.deposer(guildId, userId, montant) : banque.retirer(guildId, userId, montant);
    if (!r.ok) {
      const contenu = depot ? texteRefusDepot(t, nombre, r.raison) : texteRefusRetrait(t, r.raison);
      return interaction.reply(C.erreurPrivee(contenu));
    }

    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## ${m.emoji} ${t(depot ? 'banque.depose' : 'banque.retire', { somme: eco.somme(guildId, montant) })}`),
      C.separateur(),
      C.texte(t('banque.recap', { poche: eco.somme(guildId, r.poche), banque: eco.somme(guildId, r.banque) })),
    ], 0xf8bd2c)]));
  },
};

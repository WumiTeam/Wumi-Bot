/**
 * Pays pour le quiz des drapeaux : code ISO 3166-1 alpha-2 (pour l'image du
 * drapeau), nom francais, nom anglais, continent (les mauvaises reponses sont
 * tirees du meme continent : sinon « Japon / Bresil / Suede / Kenya » se
 * devine sans connaitre aucun drapeau).
 */
const P = `
fr|France|France|eu
de|Allemagne|Germany|eu
it|Italie|Italy|eu
es|Espagne|Spain|eu
pt|Portugal|Portugal|eu
be|Belgique|Belgium|eu
nl|Pays-Bas|Netherlands|eu
lu|Luxembourg|Luxembourg|eu
ch|Suisse|Switzerland|eu
at|Autriche|Austria|eu
gb|Royaume-Uni|United Kingdom|eu
ie|Irlande|Ireland|eu
dk|Danemark|Denmark|eu
se|Suède|Sweden|eu
no|Norvège|Norway|eu
fi|Finlande|Finland|eu
is|Islande|Iceland|eu
pl|Pologne|Poland|eu
cz|Tchéquie|Czechia|eu
sk|Slovaquie|Slovakia|eu
hu|Hongrie|Hungary|eu
ro|Roumanie|Romania|eu
bg|Bulgarie|Bulgaria|eu
gr|Grèce|Greece|eu
hr|Croatie|Croatia|eu
si|Slovénie|Slovenia|eu
rs|Serbie|Serbia|eu
ua|Ukraine|Ukraine|eu
ee|Estonie|Estonia|eu
lv|Lettonie|Latvia|eu
lt|Lituanie|Lithuania|eu
mt|Malte|Malta|eu
cy|Chypre|Cyprus|eu
al|Albanie|Albania|eu
mc|Monaco|Monaco|eu
us|États-Unis|United States|am
ca|Canada|Canada|am
mx|Mexique|Mexico|am
br|Brésil|Brazil|am
ar|Argentine|Argentina|am
cl|Chili|Chile|am
pe|Pérou|Peru|am
co|Colombie|Colombia|am
ve|Venezuela|Venezuela|am
uy|Uruguay|Uruguay|am
py|Paraguay|Paraguay|am
bo|Bolivie|Bolivia|am
ec|Équateur|Ecuador|am
cu|Cuba|Cuba|am
jm|Jamaïque|Jamaica|am
ht|Haïti|Haiti|am
do|République dominicaine|Dominican Republic|am
cr|Costa Rica|Costa Rica|am
pa|Panama|Panama|am
cn|Chine|China|as
jp|Japon|Japan|as
kr|Corée du Sud|South Korea|as
kp|Corée du Nord|North Korea|as
in|Inde|India|as
pk|Pakistan|Pakistan|as
bd|Bangladesh|Bangladesh|as
th|Thaïlande|Thailand|as
vn|Viêt Nam|Vietnam|as
id|Indonésie|Indonesia|as
my|Malaisie|Malaysia|as
sg|Singapour|Singapore|as
ph|Philippines|Philippines|as
np|Népal|Nepal|as
lk|Sri Lanka|Sri Lanka|as
mn|Mongolie|Mongolia|as
kz|Kazakhstan|Kazakhstan|as
tr|Turquie|Turkey|as
sa|Arabie saoudite|Saudi Arabia|as
ae|Émirats arabes unis|United Arab Emirates|as
qa|Qatar|Qatar|as
il|Israël|Israel|as
lb|Liban|Lebanon|as
ir|Iran|Iran|as
iq|Irak|Iraq|as
jo|Jordanie|Jordan|as
eg|Égypte|Egypt|af
ma|Maroc|Morocco|af
dz|Algérie|Algeria|af
tn|Tunisie|Tunisia|af
sn|Sénégal|Senegal|af
ci|Côte d'Ivoire|Ivory Coast|af
ml|Mali|Mali|af
cm|Cameroun|Cameroon|af
ng|Nigeria|Nigeria|af
gh|Ghana|Ghana|af
ke|Kenya|Kenya|af
et|Éthiopie|Ethiopia|af
za|Afrique du Sud|South Africa|af
mg|Madagascar|Madagascar|af
cd|République démocratique du Congo|DR Congo|af
cg|République du Congo|Republic of the Congo|af
ga|Gabon|Gabon|af
bf|Burkina Faso|Burkina Faso|af
gn|Guinée|Guinea|af
rw|Rwanda|Rwanda|af
tz|Tanzanie|Tanzania|af
ug|Ouganda|Uganda|af
ao|Angola|Angola|af
mz|Mozambique|Mozambique|af
zw|Zimbabwe|Zimbabwe|af
na|Namibie|Namibia|af
bw|Botswana|Botswana|af
au|Australie|Australia|oc
nz|Nouvelle-Zélande|New Zealand|oc
fj|Fidji|Fiji|oc
pg|Papouasie-Nouvelle-Guinée|Papua New Guinea|oc
ws|Samoa|Samoa|oc
`;

const pays = P.trim().split('\n').map((l) => {
  const [code, fr, en, continent] = l.split('|');
  return { code, fr, en, continent };
});

/** L'image du drapeau (PNG, 320 px de large, service public flagcdn). */
const image = (code) => `https://flagcdn.com/w320/${code}.png`;

module.exports = { pays, image };

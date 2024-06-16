const unavailabilityTerms = [
  'uitgesteld',
  'verplaatst',
  'locatie gewijzigd',
  'besloten',
  'afgelast',
  'geannuleerd',
];

const forbiddenTerms = [
  'afrobeats',
  'alternatieve rock',
  'americana',
  'americana',
  'art rock',
  'bieravond',
  'blaasrock',
  'boy band',
  'brass',
  'carnivore',
  'clubnacht',
  'countryrock',
  'dance-alle-dance',
  'dance-punk',
  'dance',
  'dream pop',
  'dream punk',
  'drill',
  'dromerig',
  'electropop',
  'experi-metal',
  'fan event',
  'filmvertoning',
  'folkpunk',
  'funk-soul,pop',
  'global,pop',
  'house',
  'indie',
  'interactieve lezing',
  'jazz-core',
  'k-pop',
  'karaoke',
  'ldsports',
  'london calling',
  'mellow gold',
  'modern blues',
  'neofolk',
  'new french touch',
  'new romantic',
  'new wave',
  'piano rock',
  'poetry',
  'pop',
  'pubquiz',
  'punk-hop',
  'r&b',
  'rock-alternative',
  'schaakinstuif',
  'shoegaze',
  'singer-songwriter',
  'sophisti-pop',
  'trap',
  'uptempo',
  'VERBODENGENRE',
  'viral pop',
  'workshop',
  "australian hip hop",
  "dutch rap pop",
  "modern alternative rock",
  "open dag",
  "pov: indie",
  "quiz'm",
];

const globalForbiddenGenres = [
  'drill',
  'dance',
  'indie',
  'dream',
  'shoegaze',
  'new-wave',
];

const globalGoodCategories = [
  'metal',
  'black',
  'crossover',
  'doom',
];

const wikipediaGoodGenres = [
  '[href$=metal]',
  '[href$=metal_music]',
  '[href=Hard_rock]',
  '[href=Acid_rock]',
  '[href=Death_rock]',
  '[href=Experimental_rock]',
  '[href=Garage_rock]',
  '[href=Hard_rock]',
  '[href=Post-rock]',
  '[href=Punk_rock]',
  '[href=Stoner_rock]',
  '[href=Hardcore_punk]',
  '[href=Skate_punk]',
  '[href=Street_punk]',
  '[href=Ska_punk]',
  '[href=Avant-garde_metal]',
  '[href=Extreme_metal]',
  '[href=Black_metal]',
  '[href=Death_metal]',
  '[href=Doom_metal]',
  '[href=Speed_metal]',
  '[href=Thrash_metal]',
  '[href=Glam_metal]',
  '[href=Groove_metal]',
  '[href=Power_metal]',
  '[href=Symphonic_metal]',
  '[href=Funk_metal]',
  '[href=Rap_metal]',
  '[href=Nu_metal]',
  '[href=Drone_metal]',
  '[href=Folk_metal]',
  '[href=Gothic_metal]',
  '[href=Post-metal]',
  '[href=Industrial_metal]',
  '[href=Neoclassical_metal]',
  '[href=Progressive_metal]',
  '[href=Sludge_metal]',
  '[href=Viking_metal]',
];

const goodCategories = [
  "dark rock",
  "dark metal",
  'dutch metal',
  'gothic metal',
  'gothic symphonic metal',
  'symphonic metal',
  'death metal',
  'deathcore',
  'doom',
  'garage',
  'grindcore',
  'hard rock',
  'hardcore punk',
  'hardcore',
  'heavy metal',
  'heavy psych',
  'heavy rock',
  'industrial',
  'math rock',
  'melodic metalcore',
  'metal',
  'metalcore',
  'metalcore',
  'neue deutsche haerte',
  'neue deutsche harte',
  'noise',
  'nu metal',
  'post-black',
  'post-punk',
  'postpunk',
  'power metal',
  'psychobilly',
  'punk-emo-hardcore',
  'punk',
  'punx',
  'rockabilly, surf',
  'stoner',
  'surfpunkabilly',
  'symphonic metal',
  'thrash',
  "heavy rock 'n roll",
];

export default {
  unavailability: unavailabilityTerms,
  forbidden: forbiddenTerms,
  globalForbiddenGenres,
  wikipediaGoodGenres,
  goodCategories,
  globalGoodCategories,
};

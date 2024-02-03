import Artists from './artists.js';

const ArtistsInst = new Artists();

const tusky = ArtistsInst.do({
  request: 'getStoredArtist',
  data: {
    artistName: 'tusky',
  },
});

console.log(tusky);

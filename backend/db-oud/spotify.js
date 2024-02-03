/* eslint-disable no-console */

import fs from 'fs';

const settings = {
  batchSize: 25,
  maxArtistsLookup: 3000,
};

function createFormBody(requestBodyObject) {
  let formBody = [];
  // eslint-disable-next-line no-restricted-syntax, guard-for-in
  for (const property in requestBodyObject) {
    const encodedKey = encodeURIComponent(property);
    const encodedValue = encodeURIComponent(requestBodyObject[property]);
    formBody.push(`${encodedKey}=${encodedValue}`);
  }
  formBody = formBody.join("&");
  return formBody;
}

async function getSpotifyAccessToken() {
  const requestBody = createFormBody({
    grant_type: `client_credentials`,
    client_id: `11bf5090af7b42848c20124d8c83fda3`,
    client_secret: `55f3635cd31d4d97a47af46c51f20443`,
  });

  const fetchResult = await fetch("https://accounts.spotify.com/api/token", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: requestBody,
  }).then((response) => response.json())
    .catch((err) => console.error(err));

  if (fetchResult?.access_token) {
    return fetchResult.access_token;
  } 
  console.log(`err fetching access token!`);
  console.log(fetchResult);
  throw Error(`fetch result no access token`);
}

async function getSpotifyArtistById(id, accessToken) {
  const fetchResult = 
    await fetch(`https://api.spotify.com/v1/artists/${id}`, 
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',            
          Authorization: `Bearer ${accessToken}`,
        }, 
      }).then((response) => response.json())
      .catch((err) => console.error(err));
  // console.log(fetchResult);
  return fetchResult;
}

async function getSpotifyArtistSearch(artist, accessToken) {
  const uriComponent = encodeURIComponent(`artist:${artist}`);
  const url = `https://api.spotify.com/v1/search?q=${uriComponent}&type=artist&offset=0&limit=20&market=NL`;
  // console.log(url);
  const fetchResult = 
    await fetch(url, 
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',            
          Authorization: `Bearer ${accessToken}`,
        }, 
      }).then((response) => response.json())
      .catch((err) => console.error(err));
  if (fetchResult?.artists?.items && fetchResult?.artists?.items.length) {
    console.log(`gevonden ${artist}`);
    return fetchResult?.artists?.items;
  } if (fetchResult?.artists) {
    console.log(`geen resultaat voor ${artist}`); 
    // console.log(fetchResult?.artists);
    return null;
  }
  console.log(`geen resultaat uberhaupt voor ${artist}`);
  return null;
}

function searchArtistSearchForMetalOrRock(artists) {
  const genresOK = ['metal', 'punk', 'noise', 'hardcore', 'thrash', 'death', 'doom', 'stoner', 'djent', 'grind', 'oi'];
  const rockOrMetal = artists
    .find((a) => a.genres.find((g) => genresOK.find((gOk) => g.includes(gOk))));
  if (rockOrMetal) return rockOrMetal;
  console.log(`eerste resultaat dan maar met ${artists[0]?.name}`);
  console.log(artists);
  return artists[0];
}

async function recursiveArtistsCheck(accessToken, artists, result) {
  if (!artists.length) {
    return result;
  }
  const artistsCopy = [...artists];
  const thisArtist = artistsCopy.shift();
  const artistResult = await getSpotifyArtistSearch(thisArtist, accessToken);
  if (artistResult) {
    const rockArtistData = searchArtistSearchForMetalOrRock(artistResult);
    // eslint-disable-next-line no-param-reassign
    result[thisArtist] = {
      genres: rockArtistData.genres,
      spotifyUrl: rockArtistData?.external_urls?.spotify,
      spotifyId: rockArtistData.id,
    };
  } else {
    // eslint-disable-next-line no-param-reassign
    result[thisArtist] = null;
  }
  if (!artistsCopy.length) {
    return result;
  }
  return recursiveArtistsCheck(accessToken, artistsCopy, result);
}

function createArtistsToCheckBatches(artistsNames, batchLength) {
  const artistToCheckBatches = [];
  const artistToCheckBatchesLength = Math.ceil(artistsNames.length / batchLength);
  for (let i = 0; i < artistToCheckBatchesLength; i += 1) {
    artistToCheckBatches.push([]);
  }

  for (let i = 0; i < artistsNames.length; i += 1) {
    const thisName = artistsNames[i];
    const batchIndex = Math.floor(i / batchLength);
    artistToCheckBatches[batchIndex].push(thisName);
  }  
  return artistToCheckBatches;
}

async function recursiveArtistBatches(accessToken, batches, result) {
  if (!batches.length) throw Error('lege batches');
  const batchesCopy = [...batches];
  const thisBatch = batchesCopy.shift();
  const newResult = await recursiveArtistsCheck(accessToken, thisBatch, {});
  const combinedResults = { ...result, ...newResult };
  if (batchesCopy.length) {
    return recursiveArtistBatches(accessToken, batchesCopy, combinedResults);
  }
  return combinedResults;
}

async function spotifyLoopSearch(accessToken, spotifySettings) {
  const artistsJsonFile = JSON.parse(fs.readFileSync(`./rock-artists.json`));
  const artistsnameNotLookFor = [];
  const artistsNotLookedFor = {};
  const artistsnamesToLookFor = [];
  const artistNames = Object.keys(artistsJsonFile);
  for (let i = 0; i < artistNames.length && i < spotifySettings.maxArtistsLookup; i += 1) {
    const thisName = artistNames[i];
    if (artistsJsonFile[thisName]?.spotifyId) {
      artistsnameNotLookFor.push(thisName);
      artistsNotLookedFor[thisName] = artistsJsonFile[thisName];
    } else {
      artistsnamesToLookFor.push(thisName);
    }
  }

  const artistsToCheckBatches = createArtistsToCheckBatches(
    artistsnamesToLookFor, spotifySettings.batchSize,
  );
  
  const results = await recursiveArtistBatches(accessToken, artistsToCheckBatches, {});
  const toPrint = {};
  for (let i = 0; i < artistNames.length; i += 1) {
    const artistName = artistNames[i];
    const thisResult = results[artistName];
    if (thisResult) {
      toPrint[artistName] = {
        aliases: [...new Set(thisResult.aliases)],
        genres: thisResult.genres,
        spotifyUrl: thisResult.spotifyUrl,
        spotifyId: thisResult.spotifyId,      
      };
    } else if (artistsJsonFile[artistName]) {
      toPrint[artistName] = {
        aliases: [...new Set(artistsJsonFile[artistName].aliases)],
        genres: [...new Set(artistsJsonFile[artistName].genres)],
        spotifyUrl: artistsJsonFile[artistName].spotifyUrl,
        spotifyId: artistsJsonFile[artistName].spotifyId,              
      };
    }
  } // endfor
  
  fs.writeFileSync(`./artists-with-spotify.json`, JSON.stringify(toPrint, null, 2), 'utf-8');    
}

async function init(spotifySettings) {
  const accessToken = await getSpotifyAccessToken();
  // getSpotifyArtistById(`4Z8W4fKeB5YxbusRsdQVPb`, accessToken);
  //   const artistResult = await getSpotifyArtistSearch('abbath', accessToken);
  //   const rockArtist = searchArtistSearchForMetalOrRock(artistResult);
  
  spotifyLoopSearch(accessToken, spotifySettings);
}

init(settings);

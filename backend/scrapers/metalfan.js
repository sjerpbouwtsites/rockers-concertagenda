/* global document */
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
// eslint-disable-next-line import/no-extraneous-dependencies
import puppeteer from 'puppeteer';
import { Location } from '../mods/locations.js';
import QuickWorkerMessage from '../mods/quick-worker-message.js';
import getVenueMonths from '../mods/months.js';
import { workerConfig } from '../mods/worker-config.js';
import fsDirections from "../mods/fs-directions.js";

const eventsList = [];

async function metalFanDoURL(page, url, qwm) {
  await page.goto(url);
  parentPort.postMessage(qwm.workerStarted());

  const workerNames = Object.keys(workerConfig);
  const skipWithMetalfan = workerNames.concat([
    'metropoolopenair',
    '013tilburg',
    'stroomhuis',
    '013enomgevingn',
    'slvesborg',
    "muziekgebouw",
    'cultuurpodiumboerderij',
    'royalparklive',
    'ijssportcentrum',
    "afaslive",
    "doornroosje",
    "neushoorn",
    "gebouwt",
    "melkweg",
    "013",
    "tivolivredenburg",
    "effenaar",
    "groeneengel",
    "gebrnobel",
    "patronaat",
    "p60",
    "littledevil",
    "iduna",
    "metropool",
    "depul",
    "willemeen",
    "nieuwenor",
    "paradiso",
    "oosterpoort",
  ]);

  const rename = {
    '013enomgevingen': '013',
    '013enomgeving': '013',
    '013enomgevingn': '013',
    'botanique brussel': 'botanique',
    decacaofabriek: 'cacaofabriek',
    desselbelgimetoaslipknot: 'dessel',
    desselbelgimetoagunsnroses: 'dessel',
    dinkelsbhlmetoapowerwolf: 'dinkel',
    'dynamo eindhoven': 'dynamo',
    dynamoeindhoven: 'dynamo',
    clissonfrankrijkmetfoofighters: 'hellfest',
    weert: 'bospop',
    surhuizummetoathehaunted: 'surhuzumopenair',
    emmenmethatebreed: 'pitfest',
    kopenhagendenemarkenmetmtleycre: 'kopenhagen',
    'kavka antwerpen': 'kavka',
    'kavka oudaan': 'kavka',
    kavkaoudaan: 'kavka',
    'kavka zappa': 'kavka',
    festivalparkstenehei: 'graspopmetalmeeting',
    kavkazappa: 'kavka',
    nobel: 'gebrnobel',
    zappa: 'kavka',
    kavkaantwerpen: 'kavka',
    langemunt: 'langemunte',
    merleyn: 'doornroosje', // onderdeel doornroosje
    'oilsjt omploft': 'sintannazaal',
    wackenduitsland: 'wacken',
    wackenduitslandmetscorpions: 'wacken',
    wackenduitslandmetoamegadeth: 'wacken',
    wackenduitslandmetoaironmaiden: 'wacken',
    evenemententerreinweertnoord: 'weertnoord',
    ysselsteyn: 'ijsselstein',
    innocent: 'metropool',
    bluecollarhotel: 'effenaar',
  };

  const jaar = url.includes('2024') ? '2024' : '2023'; // TODO FIX
  const eventData = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, rename, jaar }) =>
      Array.from(document.querySelectorAll('.calentry')).map((metalfanEvent) => {
        let eventDate;
        let eventLocationName;

        const dateAnchorEl = metalfanEvent.querySelector('a[name]');
        eventDate = metalfanEvent.contains(dateAnchorEl) && dateAnchorEl.getAttribute('name');
        if (!eventDate) {
          const metalfanEventCaldateEl = metalfanEvent.querySelector('.caldate');
          if (metalfanEventCaldateEl) {
            const caldateTC = metalfanEventCaldateEl.textContent;
            const dayString = caldateTC.match(/\d+/)[0].padStart(2, '0');
            const monthString = caldateTC.match(/[a-z]{3}/)[0].trim();
            const monthNumber = months[monthString];

            eventDate = monthNumber && dayString ? `${jaar}-${monthNumber}-${dayString}` : null;
          }
        }
        const eventNameEl = metalfanEvent.querySelector('.event');
        const eventName = metalfanEvent.contains(eventNameEl)
          ? eventNameEl.textContent.trim()
          : 'geen naam!';

        eventNameEl.parentNode.removeChild(eventNameEl);
        const eventHTML = metalfanEvent.querySelector('.calevent').innerHTML;
        const eventCommaSplice = metalfanEvent.querySelector('.calevent').textContent.split(',');
        eventLocationName = (eventCommaSplice[0] || '').trim().toLowerCase();

        if (Object.prototype.hasOwnProperty.call(rename, eventLocationName)) {
          eventLocationName = rename[eventLocationName];
        }

        const eventHTMLrules = eventHTML.split('<br>');
        const shortText =
          eventHTMLrules.length > 1 ? eventHTMLrules[eventHTMLrules.length - 1] || '' : '';
        return {
          title: eventName,
          start: eventDate,
          eventLocationName,
          shortText,
        };
      }),
    { months: getVenueMonths('metalfan'), jaar, rename },
  );

  const musicEvents = eventData
    .map((eventDatum) => {
      let locationName = Location.makeLocationSlug(eventDatum.eventLocationName);
      const watchForWeirdLocationNames = Object.keys(rename);
      if (watchForWeirdLocationNames.includes(locationName)) {
        locationName = watchForWeirdLocationNames[locationName];
      }

      const image = `../public/location-images/${locationName}`;
      eventDatum.image = image;

      if (skipWithMetalfan.includes(locationName)) {
        return null;
      }
      eventDatum.location = locationName;
      return eventDatum;
    })
    .filter((musicEvent) => musicEvent && musicEvent.location)
    .filter((musicEvent) => !skipWithMetalfan.includes(musicEvent.location));

  musicEvents.forEach((musicEvent) => {
    eventsList.push(musicEvent);
  });

  return true;
}

async function getBaseMusicEvents(browser, qwm) {
  const page = await browser.newPage();
  await metalFanDoURL(page, 'https://www.metalfan.nl/agenda.php', qwm);
  await metalFanDoURL(page, 'https://www.metalfan.nl/agenda.php?year=2024&sw=', qwm);
}

async function scrapeMetalfan() {
  const qwm = new QuickWorkerMessage(workerData);
  parentPort.postMessage(qwm.workerInitialized());
  const browser = await puppeteer.launch();
  await getBaseMusicEvents(browser, qwm);
  parentPort.postMessage(qwm.workerDone(eventsList.length));

  const pathToEventList = fsDirections.eventLists;
  const inbetweenFix = workerData.index !== null ? `${workerData.index}` : '0';
  const pathToEventListFile = `${pathToEventList}/${workerData.family}/${inbetweenFix}.json`;
  fs.writeFile(pathToEventListFile, JSON.stringify(eventsList, null, '  '), () => {});

  browser.close();
}
parentPort.on('message', (message) => {
  const pm = JSON.parse(message);
  if (pm?.type === 'process' && pm?.subtype === 'command-die') {
    process.exit();
  }
  if (pm?.type === 'process' && pm?.subtype === 'command-start') {
    try {
      scrapeMetalfan(pm?.messageData);
    } catch (error) {
      parentPort.postMessage({
        status: 'error',
        message: error,
      });
    }
  }
});

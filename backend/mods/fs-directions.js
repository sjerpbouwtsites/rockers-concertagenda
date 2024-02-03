import path from 'path';
import fs from 'fs';

const fsDirections = {
  errorLog: path.resolve('./temp/error.log'),
  eventLists: path.resolve('./event-lists'),
  eventsListJson: path.resolve('./event-lists/events-list.json'),
  eventsListPublicJson: path.resolve('../public/events-list.json'),
  invalidEventLists: path.resolve('./temp'),
  invalidEventsListJson: path.resolve('./event-lists/invalid.json'),
  mods: path.resolve('./mods'),
  public: path.resolve('../public'),
  src: path.resolve('../src'),
  publicTexts: path.relative('./', '../public/texts'),
  publicEventImages: path.relative('./', '../public/event-images'),
  publicLocationImages: path.relative('./', '../public/location-images'),
  scrapers: {},
  scrapersDir: path.resolve('./scrapers'),
  temp: path.resolve('./temp'),
  baseEventlists: path.resolve('./temp/baseEventlists'),
  isRockAllow: path.resolve('./temp/isRock/allow.txt'),
  isRockRefuse: path.resolve('./temp/isRock/refuse.txt'),
  artistDBModels: path.resolve('./artist-db/models'),
  artistDBstore: path.resolve('./artist-db/store'),
};

// OLD
fs.readdirSync(fsDirections.mods).forEach((mod) => {
  const modName = mod.replace('.js', '').replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
  fsDirections[modName] = path.resolve(`./mods/${mod}`);
});

// NEW
fs.readdirSync(fsDirections.scrapersDir).forEach((scraper) => {
  const scraperName = scraper.replace('.js', '');
  fsDirections.scrapers[scraperName] = path.resolve(`./scrapers/${scraper}`);
});

export default fsDirections;

import path from "path";
import fs from "fs";

const fsDirections = {
  errorLog: path.resolve("./temp/error.log"),
  eventLists: path.resolve("./event-lists"),
  eventsListJson: path.resolve("./event-lists/events-list.json"),
  eventsListPublicJson: path.resolve("../public/events-list.json"),
  invalidEventLists: path.resolve("./temp"),
  invalidEventsListJson: path.resolve("./event-lists/invalid.json"),
  metaJson: path.resolve("./event-lists/meta.json"),
  metaPublicJson: path.resolve("../public/meta.json"),
  mods: path.resolve("./mods"),
  public: path.resolve("../public"),
  publicTexts: path.relative("./", "../public/texts"),
  scrapers: {},
  scrapersDir: path.resolve("./scrapers"),
  temp: path.resolve("./temp"),
  timestampsJson: path.resolve("./event-lists/timestamps.json"),
  timestampsPublicJson: path.resolve("../public/timestamps.json"),
};

// OLD
fs.readdirSync(fsDirections.mods).forEach((mod) => {
  const modName = mod.replace(".js", "").replace(/-([a-z0-9])/g, function (g) {
    return g[1].toUpperCase();
  });
  fsDirections[modName] = path.resolve(`./mods/${mod}`);
});

// NEW
fs.readdirSync(fsDirections.scrapersDir).forEach((scraper) => {
  const scraperName = scraper.replace(".js", "");
  fsDirections.scrapers[scraperName] = path.resolve(`./scrapers/${scraper}`);
});

export default fsDirections;

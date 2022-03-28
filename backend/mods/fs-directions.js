import path from "path";
import fs from "fs";

const fsDirections = {
  eventLists: path.resolve("./event-lists"),
  mods: path.resolve("./mods"),
  temp: path.resolve("./temp"),
  errorLog: path.resolve("./temp/error.log"),
  baroegJson: path.resolve("./event-lists/baroeg.json"),
  eventsListJson: path.resolve("./event-lists/events-list.json"),
  boerderijJson: path.resolve("./event-lists/boerderij.json"),
  patronaatJson: path.resolve("./event-lists/patronaat.json"),
  dynamoJson: path.resolve("./event-lists/dynamo.json"),
  metalfanJson: path.resolve("./event-lists/metalfan.json"),
  occiiJson: path.resolve("./event-lists/occii.json"),
  timestampsJson: path.resolve("./event-lists/timestamps.json"),
  public: path.resolve("../public"),
  publicTexts: path.resolve("../public/texts"),
  eventsListPublicJson: path.resolve("../public/events-list.json"),
  timestampsPublicJson: path.resolve("../public/timestamps.json"),
};

fs.readdirSync(fsDirections.mods).forEach((mod) => {
  const modName = mod.replace(".js", "").replace(/-([a-z])/g, function (g) {
    return g[1].toUpperCase();
  });
  fsDirections[modName] = path.resolve(`./mods/${mod}`);
});

export default fsDirections;

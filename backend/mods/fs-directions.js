import path from "path";
import fs from "fs";

const fsDirections = {
  '013Json': path.resolve("./event-lists/013.json"),
  afasliveJson: path.resolve("./event-lists/afaslive.json"),
  baroegJson: path.resolve("./event-lists/baroeg.json"),
  bibelotJson: path.resolve("./event-lists/bibelot.json"),
  boerderijJson: path.resolve("./event-lists/boerderij.json"),
  dbsJson: path.resolve("./event-lists/dbs.json"),
  depulJson: path.resolve("./event-lists/depul.json"),
  dynamoJson: path.resolve("./event-lists/dynamo.json"),
  effenaarJson: path.resolve("./event-lists/effenaar.json"),
  errorLog: path.resolve("./temp/error.log"),
  eventLists: path.resolve("./event-lists"),
  eventsListJson: path.resolve("./event-lists/events-list.json"),
  eventsListPublicJson: path.resolve("../public/events-list.json"),
  gebrdenobelJson: path.resolve("./event-lists/gebrdenobel.json"),
  idunaJson: path.resolve("./event-lists/iduna.json"),
  kavkaJon: path.resolve("./event-lists/kavka.json"),
  metaJson: path.resolve("./event-lists/meta.json"),
  metalfanJson: path.resolve("./event-lists/metalfan.json"),
  metaPublicJson: path.resolve("../public/meta.json"),
  mods: path.resolve("./mods"),
  neushoornJson: path.resolve("./event-lists/neushoorn.json"),
  occiiJson: path.resolve("./event-lists/occii.json"),
  patronaatJson: path.resolve("./event-lists/patronaat.json"),
  public: path.resolve("../public"),
  publicTexts: path.relative("./", "../public/texts"),
  temp: path.resolve("./temp"),
  timestampsJson: path.resolve("./event-lists/timestamps.json"),
  timestampsPublicJson: path.resolve("../public/timestamps.json"),
};

fs.readdirSync(fsDirections.mods).forEach((mod) => {
  const modName = mod.replace(".js", "").replace(/-([a-z0-9])/g, function (g) {
    return g[1].toUpperCase();
  });
  fsDirections[modName] = path.resolve(`./mods/${mod}`);
});

export default fsDirections;

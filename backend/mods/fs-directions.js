import path from "path";
import fs from "fs";

const fsDirections = {
  eventLists: path.resolve("./event-lists"),
  mods: path.resolve("./mods"),
  temp: path.resolve("./temp"),
  errorLog: path.resolve("./temp/error.log"),
  baroegJson: path.resolve("./event-lists/baroeg.json"),
  eventsListJson: path.resolve("./event-lists/events-list.json"),
  metaJson: path.resolve("./event-lists/meta.json"),
  boerderijJson: path.resolve("./event-lists/boerderij.json"),
  '013Json': path.resolve("./event-lists/013.json"),
  patronaatJson: path.resolve("./event-lists/patronaat.json"),
  dynamoJson: path.resolve("./event-lists/dynamo.json"),
  metalfanJson: path.resolve("./event-lists/metalfan.json"),
  bibelotJson: path.resolve("./event-lists/bibelot.json"),
  afasliveJson: path.resolve("./event-lists/afaslive.json"),
  idunaJson: path.resolve("./event-lists/iduna.json"),
  dbsJson: path.resolve("./event-lists/dbs.json"),
  occiiJson: path.resolve("./event-lists/occii.json"),
  effenaarJson: path.resolve("./event-lists/effenaar.json"),
  gebrdenobelJson: path.resolve("./event-lists/gebrdenobel.json"),
  neushoornJson: path.resolve("./event-lists/neushoorn.json"),
  timestampsJson: path.resolve("./event-lists/timestamps.json"),
  public: path.resolve("../public"),
  publicTexts: path.relative("./", "../public/texts"),
  eventsListPublicJson: path.resolve("../public/events-list.json"),
  timestampsPublicJson: path.resolve("../public/timestamps.json"),
  metaPublicJson: path.resolve("../public/meta.json"),
};

fs.readdirSync(fsDirections.mods).forEach((mod) => {
  const modName = mod.replace(".js", "").replace(/-([a-z0-9])/g, function (g) {
    return g[1].toUpperCase();
  });
  fsDirections[modName] = path.resolve(`./mods/${mod}`);
});

export default fsDirections;

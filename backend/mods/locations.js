import fs from "fs";
export class Location {
  constructor(config) {
    this.name = config.name;
    this.city = config.city;
  }
  static makeLocationSlug(rawName) {
    if (rawName === "nul13") {
      return "nul13";
    }
    return rawName.replace(/\s/g, "-").replace(/\W/g, "").toLowerCase();
  }
}

export function printLocationsToPublic() {
  fs.writeFile(
    "../public/locations.json",
    JSON.stringify(locations),
    "utf-8",
    () => {}
  );
}

const locations = {
  ab: new Location({
    name: "Ab",
    city: "Brussel",
  }),
  afaslive: new Location({ name: "Afas Live", city: `Amsterdam` }),
  ahoy: new Location({ name: "Ahoy", city: "Rotterdam" }),
  amphitheater: new Location({ name: "Amphitheater", city: "Gelsenkirchen" }),
  anciennebelgique: new Location({
    name: "Ancienne Belgique",
    city: "Brussel",
  }),
  annakerk: new Location({ name: "Annakerk", city: "Amstelveen" }),
  baroeg: new Location({ name: "Baroeg", city: "Rotterdam" }),
  bastardclub: new Location({ name: "Bastardclub", city: "Osnabrueck" }),
  bibelot: new Location({ name: "Bibelot", city: "Dordrecht" }),
  biebob: new Location({ name: "Biebob", city: "Vosselaar" }),
  boerderij: new Location({ name: "Boerderij", city: "Zoetemeer" }),
  bolwerk: new Location({ name: "Bolwerk", city: "Sneek" }),
  botanique: new Location({ name: "Botanique", city: "Brussel" }),
  cacaofabriek: new Location({ name: "Cacaofabriek", city: "Helmond" }),
  carlswerkvictoria: new Location({
    name: "Carlswerk Victoria",
    city: "Keulen",
  }),
  dbs: new Location({ name: "dBs", city: "Utrecht" }),
  dedreef: new Location({ name: "De Dreef", city: "Vorselaar" }),
  dehelling: new Location({ name: "De Helling", city: "Utrecht" }),
  deklinker: new Location({ name: "De Klinker", city: "Winschoten" }),
  delangemunte: new Location({ name: "De Lange Munte", city: "Kortrijk" }),
  depeppel: new Location({ name: "De Peppel", city: "Zeist" }),
  depul: new Location({ name: "De Pul", city: "Uden" }),
  deverlichtegeest: new Location({
    name: "De Verlichte Geest",
    city: "Roeselare",
  }),
  doornroosje: new Location({ name: "Doornroosje", city: "Nijmegen" }),
  dynamo: new Location({ name: "Dynamo", city: "Eindhoven" }),
  effenaar: new Location({ name: "Effenaar", city: "Eindhoven" }),
  entrepot: new Location({ name: "Entrepot", city: "Eindhoven" }),
  essigfabrik: new Location({ name: "Essigfabrik", city: "Keulen" }),
  gebrdenobel: new Location({ name: "Gebr. De Nobel", city: "Leiden" }),
  gelredome: new Location({ name: "Gelredome", city: "Arnhem" }),
  goffertpark: new Location({ name: "Goffertpark", city: "Nijmegen" }),
  groeneengel: new Location({ name: "Groene Engel", city: "Oss" }),
  grotekerk: new Location({ name: "Grote Kerk", city: "Zwolle" }),
  hedon: new Location({ name: "Hedon", city: "Zwolle" }),
  helios37: new Location({ name: "Helios37", city: "Keulen" }),
  hell: new Location({ name: "Hell", city: "Diest" }),
  iduna: new Location({ name: "iduna", city: "Drachten" }),
  ijssportcentrum: new Location({ name: "Ijssportcentrum", city: "Eindhoven" }),
  kantine: new Location({ name: "Kantine", city: "Keulen" }),
  kavka: new Location({ name: "Kavka", city: "Antwerpen" }),
  klokgebouw: new Location({ name: "Klokgebouw", city: "Eindhoven" }),
  kulttempel: new Location({ name: "Kulttempel", city: "Oberhausen" }),
  littledevil: new Location({ name: "Littledevil", city: "Tilburg" }),
  mainstage: new Location({ name: "Mainstage", city: "Den Bosch" }),
  megaland: new Location({ name: "Megaland", city: "Landgraad" }),
  melkweg: new Location({ name: "Melkweg", city: "Amsterdam" }),
  merleyn: new Location({ name: "Merleyn", city: "Nijmegen" }),
  mezz: new Location({ name: "Mezz", city: "Breda" }),
  neushoorn: new Location({ name: "Neushoorn", city: "Leeuwarden" }),
  noorderkerk: new Location({ name: "Noorderkerk", city: "Sneek" }),
  nul13: new Location({ name: "013", city: "Tilburg" }),
  occii: new Location({ name: "Occii", city: "Amsterdam" }),
  oldehoofsterkerkhof: new Location({
    name: "Oldehoofsterkerkhof",
    city: "Leeuwarden",
  }),
  orangerie: new Location({ name: "Orangerie", city: "Den Bosch" }),
  paleis12: new Location({ name: "Paleis12", city: "Brussel" }),
  palladium: new Location({ name: "Palladium", city: "Keulen" }),
  paradiso: new Location({ name: "Paradiso", city: "Amsterdam" }),
  paterskerk: new Location({ name: "Paterskerk", city: "Eindhoven" }),
  patronaat: new Location({ name: "Patronaat", city: "Haarlem" }),
  poppodiumduycker: new Location({
    name: "Poppodiumduycker",
    city: "Hoofddorp",
  }),
  qfactory: new Location({ name: "Qfactory", city: "Amsterdam" }),
  ragnarok: new Location({ name: "Ragnarok", city: "Bree" }),
  simplon: new Location({ name: "Simplon", city: "Groningen" }),
  stadspark: new Location({ name: "Stadspark", city: "Groningen" }),
  stevenskerk: new Location({ name: "Stevenskerk", city: "Nijmegen" }),
  tivolivredenburg: new Location({
    name: "Tivoli Vredenburg",
    city: "Utrecht",
  }),
  tolhuistuin: new Location({ name: "Tolhuistuin", city: "Amsterdam" }),
  trix: new Location({ name: "Trix", city: "Antwerpen" }),
  volt: new Location({ name: "Volt", city: "Sittard" }),
  vorstnationaal: new Location({ name: "Vorst Nationaal", city: "Brussel" }),
  wackenduitsland: new Location({
    name: "Wacken Duitsland",
    city: "Duitsland",
  }),
  wieleman: new Location({ name: "Wieleman", city: "Westervoort" }),
  willemeen: new Location({ name: "Willemeen", city: "Arnhem" }),
  willemtwee: new Location({ name: "Willemtwee", city: "Den Bosch" }),
  zappa: new Location({ name: "Zappa", city: "Antwerpen" }),
  ziggodome: new Location({ name: "Ziggodome", city: "Amsterdam" }),
  zuiderpark: new Location({ name: "Zuiderpark", city: "Den Haag" }),
};
export default locations;

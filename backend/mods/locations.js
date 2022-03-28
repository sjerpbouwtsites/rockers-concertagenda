import fs from "fs";
export class Location {
  street = null;
  name = null;
  constructor(name) {
    this.name = name;
  }
  static makeLocationSlug(rawName) {
    if (rawName === "013") {
      return "nul13";
    }
    return rawName.replace(/\s/g, "-").replace(/\W/g, "").toLowerCase();
  }
}

export function printToPublic() {
  fs.writeFile(
    "./concertagenda-voorkant/public/location.json",
    JSON.stringify(locations),
    "utf-8",
    () => {
      console.log("goedzo");
    }
  );
}

const locations = {
  ab: new Location("Ab"),
  afaslive: new Location("Afas Live"),
  ahoy: new Location("Ahoy"),
  amphitheater: new Location("Amphitheater"),
  anciennebelgique: new Location("Ancienne Belgique"),
  annakerk: new Location("Annakerk"),
  baroeg: new Location("Baroeg"),
  bastardclub: new Location("Bastardclub"),
  bibelot: new Location("Bibelot"),
  biebob: new Location("Biebob"),
  boerderij: new Location("Boerderij"),
  bolwerk: new Location("Bolwerk"),
  botanique: new Location("Botanique"),
  cacaofabriek: new Location("Cacaofabriek"),
  carlswerkvictoria: new Location("Carlswerk Victoria"),
  dbs: new Location("dBs"),
  dedreef: new Location("De Dreef"),
  dehelling: new Location("De Helling"),
  deklinker: new Location("De Klinker"),
  delangemunte: new Location("De Lange Munte"),
  depeppel: new Location("De Peppel"),
  depul: new Location("De Pul"),
  deverlichtegeest: new Location("De Verlichte Geest"),
  doornroosje: new Location("Doornroosje"),
  dynamo: new Location("Dynamo"),
  effenaar: new Location("Effenaar"),
  entrepot: new Location("Entrepot"),
  essigfabrik: new Location("Essigfabrik"),
  gebrdenobel: new Location("Gebr. De Nobel"),
  gelredome: new Location("Gelredome"),
  goffertpark: new Location("Goffertpark"),
  groeneengel: new Location("Groene Engel"),
  grotekerk: new Location("Grote Kerk"),
  hedon: new Location("Hedon"),
  helios37: new Location("Helios37"),
  hell: new Location("Hell"),
  iduna: new Location("iduna"),
  ijssportcentrum: new Location("Ijssportcentrum"),
  kantine: new Location("Kantine"),
  kavka: new Location("Kavka"),
  klokgebouw: new Location("Klokgebouw"),
  kulttempel: new Location("Kulttempel"),
  littledevil: new Location("Littledevil"),
  mainstage: new Location("Mainstage"),
  matric: new Location("Matrix"),
  megaland: new Location("Megaland"),
  melkweg: new Location("Melkweg"),
  merleyn: new Location("Merleyn"),
  mezz: new Location("Mezz"),
  neushoorn: new Location("Neushoorn"),
  noorderkerk: new Location("Noorderkerk"),
  nul13: new Location("013"),
  occii: new Location("Occii"),
  oldehoofsterkerkhof: new Location("Oldehoofsterkerkhof"),
  orangerie: new Location("Orangerie"),
  paleis12: new Location("Paleis12"),
  palladium: new Location("Palladium"),
  paradiso: new Location("Paradiso"),
  paterskerk: new Location("Paterskerk"),
  patronaat: new Location("Patronaat"),
  poppodiumduycker: new Location("Poppodiumduycker"),
  qfactory: new Location("Qfactory"),
  ragnarok: new Location("Ragnarok"),
  simplon: new Location("Simplon"),
  stadspark: new Location("Stadspark"),
  stevenskerk: new Location("Stevenskerk"),
  tivolivredenburg: new Location("Tivoli Vredenburg"),
  tolhuistuin: new Location("Tolhuistuin"),
  trix: new Location("Trix"),
  volt: new Location("Volt"),
  vorstnationaal: new Location("Vorst Nationaal"),
  wackenduitsland: new Location("Wacken Duitsland"),
  wieleman: new Location("Wieleman"),
  willemeen: new Location("Willemeen"),
  willemtwee: new Location("Willemtwee"),
  zappa: new Location("Zappa"),
  ziggodome: new Location("Ziggodome"),
  zuiderpark: new Location("Zuiderpark"),
};
export default locations;

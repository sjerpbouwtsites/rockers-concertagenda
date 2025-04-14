import fs from "fs";
import shell from "./shell.js";

/**
 * Aangeroepen in index. Print locaties naar public als !shell.noLocPrint
 */
export function printLocationsToPublic() {
    if (shell.noLocPrint) {
        fs.writeFile(
            "../public/locations.json",
            JSON.stringify(locations),
            "utf-8",
            () => {}
        );
    }
}

const regions = [
    "België",
    "Noord-Holland",
    "Zuid-Holland",
    "Noord-Brabant",
    "Duitsland",
    "Gelderland",
    "Friesland",
    "Limburg",
    "Denemarken",
    "Utrecht",
    "Groningen",
    "Zeeland",
    "Drenthe",
    "Czechia",
    "Overijssel",
    "Germany",
    "Belgium",
    "France"
];

const locations = {
    _meta: {
        regions
    },
    ab: {
        name: "Ab",
        url: "https://www.abconcerts.be/",
        latitude: 50.8489,
        longitude: 4.3486,
        city: "Brussel",
        region: "België"
    },
    afaslive: {
        name: "Afas Live",
        url: "https://www.afaslive.nl/",
        latitude: 52.3123,
        longitude: 4.9372,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    ahoy: {
        name: "Ahoy",
        url: "https://www.ahoy.nl/",
        latitude: 51.885,
        longitude: 4.4886,
        city: "Rotterdam",
        region: "Zuid-Holland"
    },
    altstadt: {
        name: "Altstadt",
        url: "http://www.altstadt.nl/",
        latitude: 51.4389,
        longitude: 5.48,
        city: "Eindhoven",
        region: "Noord-Brabant"
    },
    amphitheater: {
        name: "Amphitheater",
        url: "https://www.gelsenkirchen.de/de/Kultur/Stadtmarketing/Amphitheater_Gelsenkirchen.aspx",
        latitude: 51.54,
        longitude: 7,
        city: "Gelsenkirchen",
        region: "Duitsland"
    },
    anciennebelgique: {
        name: "Ancienne Belgique",
        url: "https://www.abconcerts.be/",
        latitude: 50.8489,
        longitude: 4.3486,
        city: "Brussel",
        region: "België"
    },
    annakerk: {
        name: "Annakerk",
        url: "https://www.annakerk.nl/",
        latitude: 52.3,
        longitude: 4.85,
        city: "Amstelveen",
        region: "Noord-Holland"
    },
    astrant: {
        name: "Astrant",
        url: "https://astrant-ede.nl/",
        latitude: 52.045,
        longitude: 5.658,
        city: "Ede",
        region: "Gelderland"
    },
    baroeg: {
        name: "Baroeg",
        url: "https://baroeg.nl/",
        latitude: 51.877,
        longitude: 4.529,
        city: "Rotterdam",
        region: "Zuid-Holland"
    },
    bastardclub: {
        name: "Bastardclub",
        url: "https://bastardclub.de/",
        latitude: 52.2789,
        longitude: 8.0432,
        city: "Osnabrueck",
        region: "Duitsland"
    },
    bibelot: {
        name: "Bibelot",
        url: "https://www.bibelot.net/",
        latitude: 51.8133,
        longitude: 4.6736,
        city: "Dordrecht",
        region: "Zuid-Holland"
    },
    biebob: {
        name: "Biebob",
        url: "https://www.biebob.be/",
        latitude: 51.3167,
        longitude: 4.8833,
        city: "Vosselaar",
        region: "België"
    },
    boerderij: {
        name: "Boerderij",
        url: "https://www.boerderij.org/",
        latitude: 52.0575,
        longitude: 4.4931,
        city: "Zoetemeer",
        region: "Zuid-Holland"
    },
    bolwerk: {
        name: "Bolwerk",
        url: "https://www.hetbolwerk.nl/",
        latitude: 53.0326,
        longitude: 5.6581,
        city: "Sneek",
        region: "Friesland"
    },
    chinastraat: {
        name: "Chinastraat",
        url: "https://www.chinastraat.be/",
        latitude: 51.0597,
        longitude: 3.721,
        city: "Gent",
        region: "België"
    },
    debosuil: {
        name: "De Bosuil",
        url: "https://www.debosuil.nl/",
        latitude: 51.251,
        longitude: 5.706,
        city: "Weert",
        region: "Limburg"
    },
    dezon: {
        name: "De Zon",
        url: "https://www.partycentrumdezon.nl/",
        latitude: 52.082,
        longitude: 4.746,
        city: "Bodegraven",
        region: "Zuid-Holland"
    },
    botanique: {
        name: "Botanique",
        url: "https://botanique.be/",
        latitude: 50.8549,
        longitude: 4.3662,
        city: "Brussel",
        region: "België"
    },
    brabanthallen: {
        name: "Brabanthallen",
        url: "https://www.brabanthallen.nl/",
        latitude: 51.699,
        longitude: 5.304,
        city: "Den Bosch",
        region: "Noord-Brabant"
    },
    cacaofabriek: {
        name: "Cacaofabriek",
        url: "https://www.cacaofabriek.nl/",
        latitude: 51.479,
        longitude: 5.661,
        city: "Helmond",
        region: "Noord-Brabant"
    },
    carlswerkvictoria: {
        name: "Carlswerk Victoria",
        url: "https://carlswerk-victoria.de/",
        latitude: 50.958,
        longitude: 7,
        city: "Keulen",
        region: "Duitsland"
    },
    kopenhagen: {
        name: "Kopenhagen",
        city: "Kopenhagen",
        latitude: 55.6712398,
        longitude: 12.5114247,
        url: "https://www.visitcopenhagen.com/",
        region: "Denemarken"
    },
    dbs: {
        name: "dBs",
        city: "Utrecht",
        latitude: 52.1054971,
        longitude: 5.0805506,
        url: "http://www.dbstudio.nl/",
        region: "Utrecht"
    },
    dedrom: {
        name: "De Drom",
        city: "Enkhuizen",
        latitude: 52.7007987,
        longitude: 5.2903794,
        url: "https://www.visitenkhuizen.nl/",
        region: "Noord-Holland"
    },
    dehelling: {
        name: "De Helling",
        city: "Utrecht",
        latitude: 52.0769048,
        longitude: 5.1190827,
        url: "http://www.dehelling.nl/",
        region: "Utrecht"
    },
    deklinker: {
        name: "De Klinker",
        city: "Winschoten",
        latitude: 53.1471239,
        longitude: 7.0312254,
        url: "http://www.indeklinker.nl/",
        region: "Groningen"
    },
    delangemunte: {
        name: "De Lange Munte",
        city: "Kortrijk",
        latitude: 50.8091272,
        longitude: 3.2919095,
        url: "https://www.visitkortrijk.be/nl",
        region: "België"
    },
    depeppel: {
        name: "De Peppel",
        url: "https://www.peppel-zeist.nl/",
        latitude: 52.0906,
        longitude: 5.2333,
        city: "Zeist",
        region: "Utrecht"
    },
    depul: {
        name: "De Pul",
        url: "https://www.livepul.com/",
        latitude: 51.66,
        longitude: 5.6194,
        city: "Uden",
        region: "Noord-Brabant"
    },
    deflux: {
        name: "De Flux",
        url: "https://www.podiumdeflux.nl/",
        latitude: 52.4381,
        longitude: 4.8265,
        city: "Zaandam",
        region: "Noord-Holland"
    },
    dekroepoekfabriek: {
        name: "De Kroepoekfabriek",
        url: "https://kroepoekfabriek.nl/",
        latitude: 51.4425,
        longitude: 3.5736,
        city: "Vlissingen",
        region: "Zeeland"
    },
    despont: {
        name: "De Spont",
        url: "https://www.spont.net/",
        latitude: 52.9917,
        longitude: 6.95,
        city: "Stadskanaal",
        region: "Groningen"
    },
    despot: {
        name: "De Spot",
        url: "https://www.despotmiddelburg.nl/",
        latitude: 51.4986,
        longitude: 3.6139,
        city: "Middelburg",
        region: "Zeeland"
    },
    deverlichtegeest: {
        name: "De Verlichte Geest",
        url: "https://www.deverlichtegeest.be/",
        latitude: 50.9461,
        longitude: 3.1239,
        city: "Roeselare",
        region: "België"
    },
    doornroosje: {
        name: "Doornroosje",
        url: "https://www.doornroosje.nl/",
        latitude: 51.8475,
        longitude: 5.8625,
        city: "Nijmegen",
        region: "Gelderland"
    },

    dvgclub: {
        name: "De Verlichte Geest",
        city: "Kortrijk",
        latitude: 50.8183037,
        longitude: 3.2499268,
        url: "https://deverlichtegeest.be/",
        region: "België"
    },
    dynamo: {
        name: "Dynamo",
        url: "https://www.dynamo-eindhoven.nl/",
        latitude: 51.4389,
        longitude: 5.4822,
        city: "Eindhoven",
        region: "Noord-Brabant"
    },
    drucultuurfabriek: {
        name: "Dru Cultuurfabriek",
        city: "Ulft",
        url: "https://www.dynamo-eindhoven.nl/",
        latitude: 51.8954214,
        longitude: 6.3814963,
        region: "Gelderland"
    },
    cpunt: {
        name: "Cpunt",
        url: "https://www.cpunt.nl/",
        latitude: 52.3025,
        longitude: 4.6889,
        city: "Hoofddorp",
        region: "Noord-Holland"
    },
    dinkel: {
        name: "Summer Breeze",
        url: "https://www.summer-breeze.de/en/",
        latitude: 49.0983,
        longitude: 10.7481,
        city: "Beieren",
        region: "Duitsland"
    },
    ecicultuurfabriek: {
        name: "ECI cultuurfabriek",
        city: "Roermond",
        url: "https://ecicultuurfabriek.nl/",
        latitude: 51.1893704,
        longitude: 5.9758051,
        region: "Limburg"
    },
    effenaar: {
        name: "Effenaar",
        url: "https://www.effenaar.nl/",
        latitude: 51.4397,
        longitude: 5.4825,
        city: "Eindhoven",
        region: "Noord-Brabant"
    },
    eilandbuitenvest: {
        name: "Eiland buiten vest",
        city: "Hulst",
        url: "https://www.vestrock.nl/",
        latitude: 51.2777921,
        longitude: 4.0486859,
        region: "Zeeland"
    },
    essigfabrik: {
        name: "Essigfabrik",
        url: "https://essig-fabrik.de/",
        latitude: 50.9169,
        longitude: 6.9853,
        city: "Keulen",
        region: "Duitsland"
    },
    ewerk: {
        name: "E-werk",
        city: "Keulen",
        url: "https://www.e-werk-cologne.com/",
        latitude: 50.9695053,
        longitude: 7.0139093,
        region: "Duitsland"
    },
    feesttentpesse: {
        name: "Feesttent",
        url: "https://www.feesttentpesse.nl/",
        latitude: 52.7775,
        longitude: 6.4658,
        city: "Pesse",
        region: "Drenthe"
    },
    fluor: {
        name: "Fluor",
        url: "https://fluor033.nl/",
        latitude: 52.1561,
        longitude: 5.3875,
        city: "Amersfoort",
        region: "Utrecht"
    },

    foxfarm: {
        name: "Foxfarm",
        city: "Tilburg",
        url: "http://foxfarm.nl/",
        latitude: 51.5704421,
        longitude: 4.9877229,
        region: "Noord-Brabant"
    },
    fortressjosefoz: {
        name: "Fortress Josefoz",
        city: "Jaromer",
        url: "https://www.visitczechia.com/en-us/things-to-do/places/landmarks/military-monuments/c-josefov-fort",
        latitude: 50.339169,
        longitude: 15.9118224,
        region: "Czechia"
    },
    gebouwt: {
        name: "Gebouw T",
        city: "Bergen op Zoom",
        url: "https://www.gebouw-t.nl/",
        latitude: 51.4967245,
        longitude: 4.2764468,
        region: "Noord-Brabant"
    },
    gebrdenobel: {
        name: "Gebr. De Nobel",
        url: "https://gebrdenobel.nl/",
        latitude: 52.16,
        longitude: 4.4975,
        city: "Leiden",
        region: "Zuid-Holland"
    },
    gelredome: {
        name: "Gelredome",
        city: "Arnhem",
        url: "https://www.gelredome.nl/",
        latitude: 51.9631196,
        longitude: 5.8892381,
        region: "Gelderland"
    },
    gigant: {
        name: "Gigant",
        url: "https://www.gigant.nl/",
        latitude: 52.2111,
        longitude: 5.9639,
        city: "Apeldoorn",
        region: "Gelderland"
    },
    goffertpark: {
        name: "Goffertpark",
        url: "https://goffertpark.nl/",
        latitude: 51.8225,
        longitude: 5.8447,
        city: "Nijmegen",
        region: "Gelderland"
    },
    graspopmetalmeeting: {
        name: "Graspop Metal Meeting",
        url: "https://www.graspop.be/",
        latitude: 51.2436,
        longitude: 5.1064,
        city: "Oss",
        region: "Noord-Brabant"
    },
    groeneengel: {
        name: "Groene Engel",
        url: "https://www.groene-engel.nl/",
        latitude: 51.7654,
        longitude: 5.5186,
        city: "Oss",
        region: "Noord-Brabant"
    },
    groeneheuvels: {
        name: "Groene Heuvels",
        url: "https://www.groeneheuvels.nl/",
        latitude: 51.8414,
        longitude: 5.7461,
        city: "Beuningen",
        region: "Gelderland"
    },
    grotekerk: {
        name: "Grote Kerk",
        url: "https://www.grotekerkzwolle.nl/",
        latitude: 52.5122,
        longitude: 6.0919,
        city: "Zwolle",
        region: "Overijssel"
    },
    hal015: {
        name: "Hal 015",
        url: "https://www.hal015.nl/",
        latitude: 52.0123,
        longitude: 4.3595,
        city: "Delft",
        region: "Zuid-Holland"
    },
    halloffame: {
        name: "Hall of fame",
        city: "Tilburg",
        url: "http://www.hall-fame.nl/",
        latitude: 51.5607679,
        longitude: 5.087228,
        region: "Noord-Brabant"
    },

    hedon: {
        name: "Hedon",
        url: "https://www.hedon-zwolle.nl/",
        latitude: 52.5079,
        longitude: 6.0912,
        city: "Zwolle",
        region: "Overijssel"
    },
    helios37: {
        name: "Helios37",
        url: "https://www.helios37.de/",
        latitude: 50.9375,
        longitude: 6.9603,
        city: "Keulen",
        region: "Germany"
    },
    hell: {
        name: "Hell",
        url: "https://www.helldiests.be/",
        latitude: 50.9906,
        longitude: 5.0503,
        city: "Diest",
        region: "Belgium"
    },
    hellfest: {
        name: "Hellfest",
        url: "https://www.hellfest.fr/",
        latitude: 47.0897,
        longitude: -1.2769,
        city: "Clisson",
        region: "France"
    },
    hetdepot: {
        name: "Het Depot",
        url: "https://www.hetdepot.be/",
        latitude: 50.8808,
        longitude: 4.7005,
        city: "Leuven",
        region: "Belgium"
    },
    iduna: {
        name: "iduna",
        city: "Drachten",
        url: "http://www.iduna.nl/",
        latitude: 53.1084623,
        longitude: 6.0875335,
        region: "Friesland"
    },
    innocent: {
        name: "Innocent",
        url: "https://www.innocent.nl/",
        latitude: 52.2601,
        longitude: 6.7939,
        city: "Hengelo",
        region: "Overijssel"
    },
    johancruijffarena: {
        name: "Johan Cruijff Arena",
        url: "https://www.johancruijffarena.nl/",
        latitude: 52.3145,
        longitude: 4.9415,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    ijssportcentrum: {
        name: "Ijssportcentrum",
        city: "Eindhoven",
        url: "https://ijssportcentrum.nl/",
        latitude: 51.4156893,
        longitude: 5.4692607,
        region: "Noord-Brabant"
    },
    kantine: {
        name: "Kantine",
        url: "https://www.kantine.com/",
        latitude: 50.9722,
        longitude: 6.9586,
        city: "Keulen",
        region: "Germany"
    },
    kavka: {
        name: "Kavka",
        url: "https://www.kavka.be/",
        latitude: 51.2194,
        longitude: 4.4025,
        city: "Antwerpen",
        region: "Belgium"
    },
    klokgebouw: {
        name: "Klokgebouw",
        url: "https://www.klokgebouw.nl/",
        latitude: 51.4489,
        longitude: 5.4572,
        city: "Eindhoven",
        region: "Noord-Brabant"
    },
    koningboudewijnstadion: {
        name: "Koning Boudewijn Stadion",
        url: "https://www.koningboudewijnstadion.be/",
        latitude: 50.8951,
        longitude: 4.3341,
        city: "Brussel",
        region: "Belgium"
    },
    kulttempel: {
        name: "Kulttempel",
        url: "https://www.kulttempel.com/",
        latitude: 51.4967,
        longitude: 6.8636,
        city: "Oberhausen",
        region: "Germany"
    },
    kunstrasen: {
        name: "Kunst!rasen",
        city: "Bonn",
        url: "http://www.kunstrasen-bonn.de/",
        latitude: 50.7174471,
        longitude: 7.1318267,
        region: "Germany"
    },
    littledevil: {
        name: "Littledevil",
        city: "Tilburg",
        url: "https://www.littledevil.nl/",
        latitude: 51.5587237,
        longitude: 5.0796498,
        region: "Noord-Brabant"
    },
    liveinhoorn: {
        name: "Live in Hoorn",
        url: "https://www.liveinhoorn.nl/",
        latitude: 52.6453,
        longitude: 5.0583,
        city: "Hoorn",
        region: "Noord-Holland"
    },
    lottoarena: {
        name: "Lotto Arena",
        url: "https://www.lotto-arena.be/",
        latitude: 51.2301,
        longitude: 4.4412,
        city: "Antwerpen",
        region: "Belgium"
    },
    luxorlive: {
        name: "Luxor Live",
        url: "https://www.luxorlive.nl/",
        latitude: 51.9856,
        longitude: 5.9025,
        city: "Arnhem",
        region: "Gelderland"
    },
    maassilo: {
        name: "Maassilo",
        url: "https://www.maassilo.com/",
        latitude: 51.9033,
        longitude: 4.4875,
        city: "Rotterdam",
        region: "Zuid-Holland"
    },
    mainstage: {
        name: "Mainstage",
        url: "https://www.mainstage.nl/",
        latitude: 51.7042,
        longitude: 5.3042,
        city: "Den Bosch",
        region: "Noord-Brabant"
    },
    megaland: {
        name: "Megaland",
        url: "https://www.megaland.nl/",
        latitude: 50.8639,
        longitude: 6.0058,
        city: "Landgraad",
        region: "Limburg"
    },
    melkweg: {
        name: "Melkweg",
        url: "https://www.melkweg.nl/",
        latitude: 52.365,
        longitude: 4.8833,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    merleyn: {
        name: "Merleyn",
        url: "https://www.doornroosje.nl/merleyn/",
        latitude: 51.8421,
        longitude: 5.8629,
        city: "Nijmegen",
        region: "Gelderland"
    },
    messe: {
        name: "Messe",
        url: "https://www.messe.de/",
        latitude: 52.3186,
        longitude: 9.8057,
        city: "Hannover",
        region: "Germany"
    },
    mezz: {
        name: "Mezz",
        url: "https://www.mezz.nl/",
        latitude: 51.5894,
        longitude: 4.7803,
        city: "Breda",
        region: "Noord-Brabant"
    },
    metropool: {
        name: "Metropool",
        url: "https://www.metropool.nl/",
        latitude: 52.2637,
        longitude: 6.7932,
        city: "Hengelo",
        region: "Overijssel"
    },
    mfc: {
        name: "Metal Front Coevorden",
        url: "https://www.metalfrontcoevorden.nl/",
        latitude: 52.6601,
        longitude: 6.7406,
        city: "Coevorden",
        region: "Drenthe"
    },
    musicon: {
        name: "Musicon",
        url: "https://www.musicon.nl/",
        latitude: 52.0666,
        longitude: 4.2999,
        city: "Den Haag",
        region: "Zuid-Holland"
    },
    muziekgieterij: {
        name: "Muziekgieterij",
        url: "https://www.muziekgieterij.nl/",
        latitude: 50.857,
        longitude: 5.7057,
        city: "Maastricht",
        region: "Limburg"
    },
    nederlanddrie: {
        name: "Nederland drie",
        city: "Wateringen",
        url: "http://www.nederlanddrie.nl/",
        latitude: 52.0191572,
        longitude: 4.2746563,
        region: "Zuid-Holland"
    },
    neushoorn: {
        name: "Neushoorn",
        url: "https://www.neushoorn.nl/",
        latitude: 53.2012,
        longitude: 5.7999,
        city: "Leeuwarden",
        region: "Friesland"
    },
    noorderkerk: {
        name: "Noorderkerk",
        url: "https://www.pg-sneek.nl/",
        latitude: 53.0323,
        longitude: 5.6572,
        city: "Sneek",
        region: "Friesland"
    },
    nieuwenor: {
        name: "Nieuwe Nor",
        url: "https://www.nieuwenor.nl/",
        latitude: 50.8882,
        longitude: 5.979,
        city: "Heerlen",
        region: "Limburg"
    },
    "013": {
        name: "013",
        url: "https://www.013.nl/",
        latitude: 51.56,
        longitude: 5.0913,
        city: "Tilburg",
        region: "Noord-Brabant"
    },
    occii: {
        name: "Occii",
        url: "https://occii.org/",
        latitude: 52.3575,
        longitude: 4.855,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    oefenbunker: {
        name: "Oefenbunker",
        url: "https://www.oefenbunker.com/",
        latitude: 50.8976,
        longitude: 6.0283,
        city: "Landgraaf",
        region: "Limburg"
    },
    oldehoofsterkerkhof: {
        name: "Oldehoofsterkerkhof",
        url: "https://www.visitleeuwarden.nl/",
        latitude: 53.2046,
        longitude: 5.7935,
        city: "Leeuwarden",
        region: "Friesland"
    },
    onsdorp: {
        name: "Ons-dorp",
        city: "Emmer-Compascuum",
        url: "http://www.buurtvereniging-onsdorp.nl/",
        latitude: 52.8107602,
        longitude: 7.0328657,
        region: "Drenthe"
    },
    oosterpoort: {
        name: "Oosterpoort",
        url: "https://www.spotgroningen.nl/",
        latitude: 53.213,
        longitude: 6.5741,
        city: "Groningen",
        region: "Groningen"
    },
    openluchttheatercaprera: {
        name: "Openlucht theater Caprera",
        city: "Haarlem",
        url: "http://caprera.nu/",
        latitude: 52.41115,
        longitude: 4.6057061,
        region: "Noord-Holland"
    },
    orangerie: {
        name: "Orangerie",
        url: "https://www.orangeriebosch.nl/",
        latitude: 51.6878,
        longitude: 5.3047,
        city: "Den Bosch",
        region: "Noord-Brabant"
    },
    paard: {
        name: "Paard",
        url: "https://www.paard.nl/",
        latitude: 52.0786,
        longitude: 4.3104,
        city: "Den Haag",
        region: "Zuid-Holland"
    },
    paleis12: {
        name: "Paleis12",
        city: "Brussel",
        url: "https://ing.arena.brussels/",
        latitude: 50.9011934,
        longitude: 4.3393078,
        region: "Belgium"
    },
    palladium: {
        name: "Palladium",
        url: "https://www.palladium-koeln.de/",
        latitude: 50.9675,
        longitude: 6.9858,
        city: "Keulen",
        region: "Germany"
    },
    paradiso: {
        name: "Paradiso",
        url: "https://www.paradiso.nl/",
        latitude: 52.3637,
        longitude: 4.8838,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    parknieuwekoers: {
        name: "Park de nieuwe koers",
        city: "Oostende",
        url: "https://www.oostende.be/nieuwekoers",
        latitude: 51.2068648,
        longitude: 2.8777373,
        region: "Belgium"
    },
    paterskerk: {
        name: "Paterskerk",
        url: "https://www.katholiekbrabant.nl/",
        latitude: 51.4392,
        longitude: 5.478,
        city: "Eindhoven",
        region: "Noord-Brabant"
    },
    patronaat: {
        name: "Patronaat",
        url: "https://www.patronaat.nl/",
        latitude: 52.3811,
        longitude: 4.6368,
        city: "Haarlem",
        region: "Noord-Holland"
    },
    paleissoestdijkbaarn: {
        name: "Paleis Soestdijk",
        url: "https://www.paleissoestdijk.nl/",
        latitude: 52.2172,
        longitude: 5.2875,
        city: "Baarn",
        region: "Utrecht"
    },
    pitfest: {
        name: "Pitfest",
        url: "https://www.pitfest.nl/",
        latitude: 52.7851,
        longitude: 6.8976,
        city: "Emmen",
        region: "Drenthe"
    },
    p60: {
        name: "P60",
        url: "https://www.p60.nl/",
        latitude: 52.3114,
        longitude: 4.8701,
        city: "Amstelveen",
        region: "Noord-Holland"
    },
    poppodiumemmen: {
        name: "Poppodium Emmen",
        url: "https://www.poppodiumemmen.nl/",
        latitude: 52.7851,
        longitude: 6.8976,
        city: "Emmen",
        region: "Drenthe"
    },
    qfactory: {
        name: "Qfactory",
        url: "https://q-factory-amsterdam.nl/",
        latitude: 52.3562,
        longitude: 4.9236,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    ragnarok: {
        name: "Ragnarok",
        url: "https://www.ragnarok.be/",
        latitude: 51.1412,
        longitude: 5.5965,
        city: "Bree",
        region: "Belgium"
    },
    redbox: {
        name: "Redbox",
        url: "https://redbox-mg.de/",
        latitude: 51.1805,
        longitude: 6.4428,
        city: "Moenchengladbach",
        region: "Germany"
    },
    resonanzwerk: {
        name: "Resonanzwerk",
        url: "https://www.resonanzwerk.de/",
        latitude: 51.4696,
        longitude: 6.8517,
        city: "Oberhausen",
        region: "Germany"
    },
    refraktor: {
        name: "ReFraktor",
        url: "null",
        latitude: null,
        longitude: null,
        city: "Luik",
        region: "Belgium"
    },
    rtmstage: {
        name: "RTM Stage",
        url: "https://www.ahoy.nl/rtm-stage",
        latitude: 51.885,
        longitude: 4.4861,
        city: "Rotterdam",
        region: "Zuid-Holland"
    },
    rotown: {
        name: "Rotown",
        url: "https://www.rotown.nl/",
        latitude: 51.9141,
        longitude: 4.4777,
        city: "Rotterdam",
        region: "Zuid-Holland"
    },
    rockpalast: {
        name: "Rockpalast",
        url: "https://www.rockpalast.de/",
        latitude: 51.4811,
        longitude: 7.2165,
        city: "Bochum",
        region: "Germany"
    },

    simplon: {
        name: "Simplon",
        url: "https://simplon.nl/",
        latitude: 53.2194,
        longitude: 6.568,
        city: "Groningen",
        region: "Groningen"
    },
    sintannazaal: {
        name: "Sint Anna zaal",
        url: "https://sint-anna-aalst-lokalen.be/",
        latitude: 50.9407287,
        longitude: 4.0146495,
        city: "Aalst",
        region: "Belgium"
    },
    spiritof66: {
        name: "Spirit of 66",
        url: "https://www.spiritof66.be/",
        latitude: 50.592,
        longitude: 5.8645,
        city: "Verviers",
        region: "Belgium"
    },
    stadspark: {
        name: "Stadspark",
        url: "https://stadsparkgroningen.nl/",
        latitude: 53.2044,
        longitude: 6.555,
        city: "Groningen",
        region: "Groningen"
    },
    studio15: {
        name: "Studio 15",
        url: "http://www.studio15talenthouse.nl/",
        latitude: 52.3639575,
        longitude: 6.6470012,
        city: "Almelo",
        region: "Overijssel"
    },
    sportpaleis: {
        name: "Sportpaleis",
        url: "https://www.sportpaleis.be/",
        latitude: 51.2172,
        longitude: 4.4412,
        city: "Antwerpen",
        region: "Belgium"
    },
    stevenskerk: {
        name: "Stevenskerk",
        url: "https://www.stevenskerk.nl/",
        latitude: 51.8449,
        longitude: 5.8645,
        city: "Nijmegen",
        region: "Gelderland"
    },
    stroomhuis: {
        name: "Stroomhuis",
        url: "https://www.stroomhuis.org/",
        latitude: 51.4416,
        longitude: 5.4697,
        city: "Eindhoven",
        region: "Noord-Brabant"
    },
    tivolivredenburg: {
        name: "Tivoli Vredenburg",
        url: "https://www.tivolivredenburg.nl/",
        latitude: 52.0907,
        longitude: 5.1214,
        city: "Utrecht",
        region: "Utrecht"
    },
    thejack: {
        name: "The Jack",
        url: "https://www.thejack.nl/",
        latitude: 51.4384,
        longitude: 5.475,
        city: "Eindhoven",
        region: "Noord-Brabant"
    },
    theloods: {
        name: "The Loods",
        url: "https://www.theloodsroosendaal.nl/",
        latitude: 51.5305,
        longitude: 4.4653,
        city: "Roosendaal",
        region: "Noord-Brabant"
    },
    tolhuistuin: {
        name: "Tolhuistuin",
        url: "https://tolhuistuin.nl/",
        latitude: 52.384,
        longitude: 4.9003,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    trix: {
        name: "Trix",
        url: "https://www.trixonline.be/",
        latitude: 51.2304,
        longitude: 4.4581,
        city: "Antwerpen",
        region: "Belgium"
    },
    turbinenhalle: {
        name: "Turbinenhalle",
        url: "https://www.turbinenhalle.de/",
        latitude: 51.4696,
        longitude: 6.854,
        city: "Oberhausen",
        region: "Germany"
    },
    turock: {
        name: "Turock",
        url: "https://www.turock.de/",
        latitude: 51.4574,
        longitude: 7.013,
        city: "Essen",
        region: "Germany"
    },
    vera: {
        name: "Vera",
        url: "https://www.vera-groningen.nl/",
        latitude: 53.2193,
        longitude: 6.5665,
        city: "Groningen",
        region: "Groningen"
    },
    victorie: {
        name: "Victorie",
        url: "https://www.podiumvictorie.nl/",
        latitude: 52.6311,
        longitude: 4.7485,
        city: "Alkmaar",
        region: "Noord-Holland"
    },
    v11: {
        name: "V11",
        url: "https://www.vessel11.nl/",
        latitude: 51.9164,
        longitude: 4.484,
        city: "Rotterdam",
        region: "Zuid-Holland"
    },
    volt: {
        name: "Volt",
        url: "https://www.poppodiumvolt.nl/",
        latitude: 50.9994,
        longitude: 5.8665,
        city: "Sittard",
        region: "Limburg"
    },
    vorstnationaal: {
        name: "Vorst Nationaal",
        url: "https://www.vorstnationaal.be/",
        latitude: 50.8085,
        longitude: 4.3256,
        city: "Brussel",
        region: "Belgium"
    },
    weertnoord: {
        name: "Weert Noord",
        url: "https://www.weert.nl/",
        latitude: 51.2610822,
        longitude: 5.6837917,
        city: "Weert",
        region: "Limburg"
    },
    wacken: {
        name: "Wacken Open Air",
        url: "https://www.wacken.com/",
        latitude: 54.0226,
        longitude: 9.3755,
        city: "Duitsland",
        region: "Germany"
    },
    wieleman: {
        name: "Wieleman",
        url: "https://www.wieleman.com/",
        latitude: 51.955,
        longitude: 5.967,
        city: "Westervoort",
        region: "Gelderland"
    },
    willemeen: {
        name: "Willemeen",
        url: "https://www.willemeen.nl/",
        latitude: 51.9843,
        longitude: 5.9114,
        city: "Arnhem",
        region: "Gelderland"
    },
    willemtwee: {
        name: "Willemtwee",
        url: "https://www.willem-twee.nl/",
        latitude: 51.6978,
        longitude: 5.3037,
        city: "Den Bosch",
        region: "Noord-Brabant"
    },
    zappa: {
        name: "Zappa",
        url: "https://www.zappa.be/",
        latitude: 51.1851,
        longitude: 4.4184,
        city: "Antwerpen",
        region: "Belgium"
    },
    ziggodome: {
        name: "Ziggodome",
        url: "https://www.ziggodome.nl/",
        latitude: 52.3144,
        longitude: 4.9378,
        city: "Amsterdam",
        region: "Noord-Holland"
    },
    zuiderpark: {
        name: "Zuiderpark",
        url: "https://adodenhaag.nl/nl/",
        latitude: 52.061,
        longitude: 4.2765,
        city: "Den Haag",
        region: "Zuid-Holland"
    },
    zag: {
        name: "Zag Arena",
        url: "https://www.zag-arena.de/",
        latitude: 52.362,
        longitude: 9.737,
        city: "Hannover",
        region: "Germany"
    }
};
export default locations;

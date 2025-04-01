import fs from "fs";

export class Location {
    constructor(config) {
        this.name = config.name;
        this.city = config.city;
    }

    static makeLocationSlug(rawName) {
        if (rawName === "013") {
            return "013";
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
        url: "https://www.abconcerts.be/",
        latitude: 50.8489,
        longitude: 4.3486,
        city: "Brussel"
    }),
    afaslive: new Location({
        name: "Afas Live",
        url: "https://www.afaslive.nl/",
        latitude: 52.3123,
        longitude: 4.9372,
        city: "Amsterdam"
    }),
    ahoy: new Location({
        name: "Ahoy",
        url: "https://www.ahoy.nl/",
        latitude: 51.885,
        longitude: 4.4886,
        city: "Rotterdam"
    }),
    altstadt: new Location({
        name: "Altstadt",
        url: "http://www.altstadt.nl/",
        latitude: 51.4389,
        longitude: 5.48,
        city: "Eindhoven"
    }),
    amphitheater: new Location({
        name: "Amphitheater",
        url: "https://www.gelsenkirchen.de/de/Kultur/Stadtmarketing/Amphitheater_Gelsenkirchen.aspx",
        latitude: 51.54,
        longitude: 7,
        city: "Gelsenkirchen"
    }),
    anciennebelgique: new Location({
        name: "Ancienne Belgique",
        url: "https://www.abconcerts.be/",
        latitude: 50.8489,
        longitude: 4.3486,
        city: "Brussel"
    }),
    annakerk: new Location({
        name: "Annakerk",
        url: "https://www.annakerk.nl/",
        latitude: 52.3,
        longitude: 4.85,
        city: "Amstelveen"
    }),
    astrant: new Location({
        name: "Astrant",
        url: "https://astrant-ede.nl/",
        latitude: 52.045,
        longitude: 5.658,
        city: "Ede"
    }),
    baroeg: new Location({
        name: "Baroeg",
        url: "https://baroeg.nl/",
        latitude: 51.877,
        longitude: 4.529,
        city: "Rotterdam"
    }),
    bastardclub: new Location({
        name: "Bastardclub",
        url: "https://bastardclub.de/",
        latitude: 52.2789,
        longitude: 8.0432,
        city: "Osnabrueck"
    }),
    bibelot: new Location({
        name: "Bibelot",
        url: "https://www.bibelot.net/",
        latitude: 51.8133,
        longitude: 4.6736,
        city: "Dordrecht"
    }),
    biebob: new Location({
        name: "Biebob",
        url: "https://www.biebob.be/",
        latitude: 51.3167,
        longitude: 4.8833,
        city: "Vosselaar"
    }),
    boerderij: new Location({
        name: "Boerderij",
        url: "https://www.boerderij.org/",
        latitude: 52.0575,
        longitude: 4.4931,
        city: "Zoetemeer"
    }),
    bolwerk: new Location({
        name: "Bolwerk",
        url: "https://www.hetbolwerk.nl/",
        latitude: 53.0326,
        longitude: 5.6581,
        city: "Sneek"
    }),
    chinastraat: new Location({
        name: "Chinastraat",
        url: "https://www.chinastraat.be/",
        latitude: 51.0597,
        longitude: 3.721,
        city: "Gent"
    }),
    debosuil: new Location({
        name: "De Bosuil",
        url: "https://www.debosuil.nl/",
        latitude: 51.251,
        longitude: 5.706,
        city: "Weert"
    }),
    dezon: new Location({
        name: "De Zon",
        url: "https://www.partycentrumdezon.nl/",
        latitude: 52.082,
        longitude: 4.746,
        city: "Bodegraven"
    }),
    botanique: new Location({
        name: "Botanique",
        url: "https://botanique.be/",
        latitude: 50.8549,
        longitude: 4.3662,
        city: "Brussel"
    }),
    brabanthallen: new Location({
        name: "Brabanthallen",
        url: "https://www.brabanthallen.nl/",
        latitude: 51.699,
        longitude: 5.304,
        city: "Den Bosch"
    }),
    cacaofabriek: new Location({
        name: "Cacaofabriek",
        url: "https://www.cacaofabriek.nl/",
        latitude: 51.479,
        longitude: 5.661,
        city: "Helmond"
    }),
    carlswerkvictoria: new Location({
        name: "Carlswerk Victoria",
        url: "https://carlswerk-victoria.de/",
        latitude: 50.958,
        longitude: 7,
        city: "Keulen"
    }),

    kopenhagen: new Location({
        name: "Kopenhagen",
        city: "Kopenhagen",
        latitude: 55.6712398,
        longitude: 12.5114247,
        url: "https://www.visitcopenhagen.com/"
    }),
    dbs: new Location({
        name: "dBs",
        city: "Utrecht",

        latitude: 52.1054971,
        longitude: 5.0805506,
        url: "http://www.dbstudio.nl/"
    }),

    dedrom: new Location({
        name: "De Drom",
        city: "Enkhuizen",

        latitude: 52.7007987,
        longitude: 5.2903794,
        url: "https://www.visitenkhuizen.nl/"
    }),

    dehelling: new Location({
        name: "De Helling",
        city: "Utrecht",
        latitude: 52.0769048,
        longitude: 5.1190827,
        url: "http://www.dehelling.nl/"
    }),
    deklinker: new Location({
        name: "De Klinker",
        city: "Winschoten",

        latitude: 53.1471239,
        longitude: 7.0312254,
        url: "http://www.indeklinker.nl/"
    }),
    delangemunte: new Location({
        name: "De Lange Munte",
        city: "Kortrijk",
        latitude: 50.8091272,
        longitude: 3.2919095,
        url: "https://www.visitkortrijk.be/nl"
    }),
    depeppel: new Location({
        name: "De Peppel",
        url: "https://www.peppel-zeist.nl/",
        latitude: 52.0906,
        longitude: 5.2333,
        city: "Zeist"
    }),
    depul: new Location({
        name: "De Pul",
        url: "https://www.livepul.com/",
        latitude: 51.66,
        longitude: 5.6194,
        city: "Uden"
    }),
    deflux: new Location({
        name: "De Flux",
        url: "https://www.podiumdeflux.nl/",
        latitude: 52.4381,
        longitude: 4.8265,
        city: "Zaandam"
    }),
    dekroepoekfabriek: new Location({
        name: "De Kroepoekfabriek",
        url: "https://kroepoekfabriek.nl/",
        latitude: 51.4425,
        longitude: 3.5736,
        city: "Vlissingen"
    }),
    despont: new Location({
        name: "De Spont",
        url: "https://www.spont.net/",
        latitude: 52.9917,
        longitude: 6.95,
        city: "Stadskanaal"
    }),
    despot: new Location({
        name: "De Spot",
        url: "https://www.despotmiddelburg.nl/",
        latitude: 51.4986,
        longitude: 3.6139,
        city: "Middelburg"
    }),
    deverlichtegeest: new Location({
        name: "De Verlichte Geest",
        url: "https://www.deverlichtegeest.be/",
        latitude: 50.9461,
        longitude: 3.1239,
        city: "Roeselare"
    }),
    doornroosje: new Location({
        name: "Doornroosje",
        url: "https://www.doornroosje.nl/",
        latitude: 51.8475,
        longitude: 5.8625,
        city: "Nijmegen"
    }),
    dvgclub: new Location({
        name: "De Verlichte Geest",
        city: "Kortrijk",
        latitude: 50.8183037,
        longitude: 3.2499268,
        url: "https://deverlichtegeest.be/"
    }),

    dynamo: new Location({
        name: "Dynamo",
        url: "https://www.dynamo-eindhoven.nl/",
        latitude: 51.4389,
        longitude: 5.4822,
        city: "Eindhoven"
    }),
    drucultuurfabriek: new Location({
        name: "Dru Cultuurfabriek",
        city: "Ulft",
        url: "https://www.dynamo-eindhoven.nl/",
        latitude: 51.8954214,
        longitude: 6.3814963
    }),
    cpunt: new Location({
        name: "Cpunt",
        url: "https://www.cpunt.nl/",
        latitude: 52.3025,
        longitude: 4.6889,
        city: "Hoofddorp"
    }),
    dinkel: new Location({
        name: "Summer Breeze",
        url: "https://www.summer-breeze.de/en/",
        latitude: 49.0983,
        longitude: 10.7481,
        city: "Beieren"
    }),
    ecicultuurfabriek: new Location({
        name: "ECI cultuurfabriek",
        city: "Roermond",
        url: "https://ecicultuurfabriek.nl/",
        latitude: 51.1893704,
        longitude: 5.9758051
    }),

    effenaar: new Location({
        name: "Effenaar",
        url: "https://www.effenaar.nl/",
        latitude: 51.4397,
        longitude: 5.4825,
        city: "Eindhoven"
    }),

    eilandbuitenvest: new Location({
        name: "Eiland buiten vest",
        city: "Hulst",
        url: "https://www.vestrock.nl/",
        latitude: 51.2777921,
        longitude: 4.0486859
    }),
    essigfabrik: new Location({
        name: "Essigfabrik",
        url: "https://essig-fabrik.de/",
        latitude: 50.9169,
        longitude: 6.9853,
        city: "Keulen"
    }),
    ewerk: new Location({
        name: "E-werk",
        city: "Keulen",
        url: "https://www.e-werk-cologne.com/",
        latitude: 50.9695053,
        longitude: 7.0139093
    }),
    feesttentpesse: new Location({
        name: "Feesttent",
        url: "https://www.feesttentpesse.nl/",
        latitude: 52.7775,
        longitude: 6.4658,
        city: "Pesse"
    }),
    fluor: new Location({
        name: "Fluor",
        url: "https://fluor033.nl/",
        latitude: 52.1561,
        longitude: 5.3875,
        city: "Amersfoort"
    }),
    foxfarm: new Location({
        name: "Foxfarm",
        city: "Tilburg",
        url: "http://foxfarm.nl/",
        latitude: 51.5704421,
        longitude: 4.9877229
    }),

    fortressjosefoz: new Location({
        name: "Fortress Josefoz",
        city: "Jaromer",
        url: "https://www.visitczechia.com/en-us/things-to-do/places/landmarks/military-monuments/c-josefov-fort",
        latitude: 50.339169,
        longitude: 15.9118224
    }),
    gebouwt: new Location({
        name: "Gebouw T",
        city: "Bergen op Zoom",
        url: "https://www.gebouw-t.nl/",
        latitude: 51.4967245,
        longitude: 4.2764468
    }),
    gebrdenobel: new Location({
        name: "Gebr. De Nobel",
        url: "https://gebrdenobel.nl/",
        latitude: 52.16,
        longitude: 4.4975,
        city: "Leiden"
    }),
    gelredome: new Location({
        name: "Gelredome",
        city: "Arnhem",
        url: "https://www.gelredome.nl/",
        latitude: 51.9631196,
        longitude: 5.8892381
    }),
    gigant: new Location({
        name: "Gigant",
        url: "https://www.gigant.nl/",
        latitude: 52.2111,
        longitude: 5.9639,
        city: "Apeldoorn"
    }),
    goffertpark: new Location({
        name: "Goffertpark",
        url: "https://goffertpark.nl/",
        latitude: 51.8225,
        longitude: 5.8447,
        city: "Nijmegen"
    }),
    graspopmetalmeeting: new Location({
        name: "Graspop Metal Meeting",
        url: "https://www.graspop.be/",
        latitude: 51.2436,
        longitude: 5.1064,
        city: "Oss"
    }),
    groeneengel: new Location({
        name: "Groene Engel",
        url: "https://www.groene-engel.nl/",
        latitude: 51.7654,
        longitude: 5.5186,
        city: "Oss"
    }),
    groeneheuvels: new Location({
        name: "Groene Heuvels",
        url: "https://www.groeneheuvels.nl/",
        latitude: 51.8414,
        longitude: 5.7461,
        city: "Beuningen"
    }),
    grotekerk: new Location({
        name: "Grote Kerk",
        url: "https://www.grotekerkzwolle.nl/",
        latitude: 52.5122,
        longitude: 6.0919,
        city: "Zwolle"
    }),
    hal015: new Location({
        name: "Hal 015",
        url: "https://www.hal015.nl/",
        latitude: 52.0123,
        longitude: 4.3595,
        city: "Delft"
    }),
    halloffame: new Location({
        name: "Hall of fame",
        city: "Tilburg",
        url: "http://www.hall-fame.nl/",
        latitude: 51.5607679,
        longitude: 5.087228
    }),
    hedon: new Location({
        name: "Hedon",
        url: "https://www.hedon-zwolle.nl/",
        latitude: 52.5079,
        longitude: 6.0912,
        city: "Zwolle"
    }),
    helios37: new Location({
        name: "Helios37",
        url: "https://www.helios37.de/",
        latitude: 50.9375,
        longitude: 6.9603,
        city: "Keulen"
    }),
    hell: new Location({
        name: "Hell",
        url: "https://www.helldiests.be/",
        latitude: 50.9906,
        longitude: 5.0503,
        city: "Diest"
    }),
    hellfest: new Location({
        name: "Hellfest",
        url: "https://www.hellfest.fr/",
        latitude: 47.0897,
        longitude: -1.2769,
        city: "Clisson"
    }),
    hetdepot: new Location({
        name: "Het Depot",
        url: "https://www.hetdepot.be/",
        latitude: 50.8808,
        longitude: 4.7005,
        city: "Leuven"
    }),
    iduna: new Location({
        name: "iduna",
        city: "Drachten",
        url: "http://www.iduna.nl/",
        latitude: 53.1084623,
        longitude: 6.0875335
    }),
    innocent: new Location({
        name: "Innocent",
        url: "https://www.innocent.nl/",
        latitude: 52.2601,
        longitude: 6.7939,
        city: "Hengelo"
    }),
    johancruijffarena: new Location({
        name: "Johan Cruijff Arena",
        url: "https://www.johancruijffarena.nl/",
        latitude: 52.3145,
        longitude: 4.9415,
        city: "Amsterdam"
    }),

    ijssportcentrum: new Location({
        name: "Ijssportcentrum",
        city: "Eindhoven",
        url: "https://ijssportcentrum.nl/",
        latitude: 51.4156893,
        longitude: 5.4692607
    }),
    kantine: new Location({
        name: "Kantine",
        url: "https://www.kantine.com/",
        latitude: 50.9722,
        longitude: 6.9586,
        city: "Keulen"
    }),
    kavka: new Location({
        name: "Kavka",
        url: "https://www.kavka.be/",
        latitude: 51.2194,
        longitude: 4.4025,
        city: "Antwerpen"
    }),
    klokgebouw: new Location({
        name: "Klokgebouw",
        url: "https://www.klokgebouw.nl/",
        latitude: 51.4489,
        longitude: 5.4572,
        city: "Eindhoven"
    }),
    koningboudewijnstadion: new Location({
        name: "Koning Boudewijn Stadion",
        url: "https://www.koningboudewijnstadion.be/",
        latitude: 50.8951,
        longitude: 4.3341,
        city: "Brussel"
    }),
    kulttempel: new Location({
        name: "Kulttempel",
        url: "https://www.kulttempel.com/",
        latitude: 51.4967,
        longitude: 6.8636,
        city: "Oberhausen"
    }),
    kunstrasen: new Location({
        name: "Kunst!rasen",
        city: "Bonn",
        url: "http://www.kunstrasen-bonn.de/",
        latitude: 50.7174471,
        longitude: 7.1318267
    }),

    littledevil: new Location({
        name: "Littledevil",
        city: "Tilburg",
        url: "https://www.littledevil.nl/",
        latitude: 51.5587237,
        longitude: 5.0796498
    }),
    liveinhoorn: new Location({
        name: "Live in Hoorn",
        url: "https://www.liveinhoorn.nl/",
        latitude: 52.6453,
        longitude: 5.0583,
        city: "Hoorn"
    }),
    lottoarena: new Location({
        name: "Lotto Arena",
        url: "https://www.lotto-arena.be/",
        latitude: 51.2301,
        longitude: 4.4412,
        city: "Antwerpen"
    }),
    luxorlive: new Location({
        name: "Luxor Live",
        url: "https://www.luxorlive.nl/",
        latitude: 51.9856,
        longitude: 5.9025,
        city: "Arnhem"
    }),
    maassilo: new Location({
        name: "Maassilo",
        url: "https://www.maassilo.com/",
        latitude: 51.9033,
        longitude: 4.4875,
        city: "Rotterdam"
    }),
    mainstage: new Location({
        name: "Mainstage",
        url: "https://www.mainstage.nl/",
        latitude: 51.7042,
        longitude: 5.3042,
        city: "Den Bosch"
    }),
    megaland: new Location({
        name: "Megaland",
        url: "https://www.megaland.nl/",
        latitude: 50.8639,
        longitude: 6.0058,
        city: "Landgraad"
    }),
    melkweg: new Location({
        name: "Melkweg",
        url: "https://www.melkweg.nl/",
        latitude: 52.365,
        longitude: 4.8833,
        city: "Amsterdam"
    }),
    merleyn: new Location({
        name: "Merleyn",
        url: "https://www.doornroosje.nl/merleyn/",
        latitude: 51.8421,
        longitude: 5.8629,
        city: "Nijmegen"
    }),
    messe: new Location({
        name: "Messe",
        url: "https://www.messe.de/",
        latitude: 52.3186,
        longitude: 9.8057,
        city: "Hannover"
    }),
    mezz: new Location({
        name: "Mezz",
        url: "https://www.mezz.nl/",
        latitude: 51.5894,
        longitude: 4.7803,
        city: "Breda"
    }),
    metropool: new Location({
        name: "Metropool",
        url: "https://www.metropool.nl/",
        latitude: 52.2637,
        longitude: 6.7932,
        city: "Hengelo"
    }),
    mfc: new Location({
        name: "Metal Front Coevorden",
        url: "https://www.metalfrontcoevorden.nl/",
        latitude: 52.6601,
        longitude: 6.7406,
        city: "Coevorden"
    }),
    musicon: new Location({
        name: "Musicon",
        url: "https://www.musicon.nl/",
        latitude: 52.0666,
        longitude: 4.2999,
        city: "Den Haag"
    }),
    muziekgieterij: new Location({
        name: "Muziekgieterij",
        url: "https://www.muziekgieterij.nl/",
        latitude: 50.857,
        longitude: 5.7057,
        city: "Maastricht"
    }),

    nederlanddrie: new Location({
        name: "Nederland drie",
        city: "Wateringen",
        url: "http://www.nederlanddrie.nl/",
        latitude: 52.0191572,
        longitude: 4.2746563
    }),
    neushoorn: new Location({
        name: "Neushoorn",
        url: "https://www.neushoorn.nl/",
        latitude: 53.2012,
        longitude: 5.7999,
        city: "Leeuwarden"
    }),
    noorderkerk: new Location({
        name: "Noorderkerk",
        url: "https://www.pg-sneek.nl/",
        latitude: 53.0323,
        longitude: 5.6572,
        city: "Sneek"
    }),
    nieuwenor: new Location({
        name: "Nieuwe Nor",
        url: "https://www.nieuwenor.nl/",
        latitude: 50.8882,
        longitude: 5.979,
        city: "Heerlen"
    }),
    "013": new Location({
        name: "013",
        url: "https://www.013.nl/",
        latitude: 51.56,
        longitude: 5.0913,
        city: "Tilburg"
    }),
    occii: new Location({
        name: "Occii",
        url: "https://occii.org/",
        latitude: 52.3575,
        longitude: 4.855,
        city: "Amsterdam"
    }),
    oefenbunker: new Location({
        name: "Oefenbunker",
        url: "https://www.oefenbunker.com/",
        latitude: 50.8976,
        longitude: 6.0283,
        city: "Landgraaf"
    }),
    oldehoofsterkerkhof: new Location({
        name: "Oldehoofsterkerkhof",
        url: "https://www.visitleeuwarden.nl/",
        latitude: 53.2046,
        longitude: 5.7935,
        city: "Leeuwarden"
    }),
    onsdorp: new Location({
        name: "Ons-dorp",
        city: "Emmer-Compascuum",
        url: "http://www.buurtvereniging-onsdorp.nl/",
        latitude: 52.8107602,
        longitude: 7.0328657
    }),
    oosterpoort: new Location({
        name: "Oosterpoort",
        url: "https://www.spotgroningen.nl/",
        latitude: 53.213,
        longitude: 6.5741,
        city: "Groningen"
    }),
    openluchttheatercaprera: new Location({
        name: "Openlucht theater Caprera",
        city: "Haarlem",
        url: "http://caprera.nu/",
        latitude: 52.41115,
        longitude: 4.6057061
    }),
    orangerie: new Location({
        name: "Orangerie",
        url: "https://www.orangeriebosch.nl/",
        latitude: 51.6878,
        longitude: 5.3047,
        city: "Den Bosch"
    }),
    paard: new Location({
        name: "Paard",
        url: "https://www.paard.nl/",
        latitude: 52.0786,
        longitude: 4.3104,
        city: "Den Haag"
    }),
    paleis12: new Location({
        name: "Paleis12",
        city: "Brussel",
        url: "https://ing.arena.brussels/",
        latitude: 50.9011934,
        longitude: 4.3393078
    }),
    palladium: new Location({
        name: "Palladium",
        url: "https://www.palladium-koeln.de/",
        latitude: 50.9675,
        longitude: 6.9858,
        city: "Keulen"
    }),
    paradiso: new Location({
        name: "Paradiso",
        url: "https://www.paradiso.nl/",
        latitude: 52.3637,
        longitude: 4.8838,
        city: "Amsterdam"
    }),
    parknieuwekoers: new Location({
        name: "Park de nieuwe koers",
        city: "Oostende",
        url: "https://www.oostende.be/nieuwekoers",
        latitude: 51.2068648,
        longitude: 2.8777373
    }),
    paterskerk: new Location({
        name: "Paterskerk",
        url: "https://www.katholiekbrabant.nl/",
        latitude: 51.4392,
        longitude: 5.478,
        city: "Eindhoven"
    }),
    patronaat: new Location({
        name: "Patronaat",
        url: "https://www.patronaat.nl/",
        latitude: 52.3811,
        longitude: 4.6368,
        city: "Haarlem"
    }),
    paleissoestdijkbaarn: new Location({
        name: "Paleis Soestdijk",
        url: "https://www.paleissoestdijk.nl/",
        latitude: 52.2172,
        longitude: 5.2875,
        city: "Baarn"
    }),

    pitfest: new Location({
        name: "Pitfest",
        url: "https://www.pitfest.nl/",
        latitude: 52.7851,
        longitude: 6.8976,
        city: "Emmen"
    }),
    p60: new Location({
        name: "P60",
        url: "https://www.p60.nl/",
        latitude: 52.3114,
        longitude: 4.8701,
        city: "Amstelveen"
    }),
    poppodiumemmen: new Location({
        name: "Poppodium Emmen",
        url: "https://www.poppodiumemmen.nl/",
        latitude: 52.7851,
        longitude: 6.8976,
        city: "Emmen"
    }),
    qfactory: new Location({
        name: "Qfactory",
        url: "https://q-factory-amsterdam.nl/",
        latitude: 52.3562,
        longitude: 4.9236,
        city: "Amsterdam"
    }),
    ragnarok: new Location({
        name: "Ragnarok",
        url: "https://www.ragnarok.be/",
        latitude: 51.1412,
        longitude: 5.5965,
        city: "Bree"
    }),
    redbox: new Location({
        name: "Redbox",
        url: "https://redbox-mg.de/",
        latitude: 51.1805,
        longitude: 6.4428,
        city: "Moenchengladbach"
    }),
    resonanzwerk: new Location({
        name: "Resonanzwerk",
        url: "https://www.resonanzwerk.de/",
        latitude: 51.4696,
        longitude: 6.8517,
        city: "Oberhausen"
    }),
    refraktor: new Location({
        name: "ReFraktor",
        url: "null",
        latitude: null,
        longitude: null,
        city: "Luik"
    }),
    rtmstage: new Location({
        name: "RTM Stage",
        url: "https://www.ahoy.nl/rtm-stage",
        latitude: 51.885,
        longitude: 4.4861,
        city: "Rotterdam"
    }),
    rotown: new Location({
        name: "Rotown",
        url: "https://www.rotown.nl/",
        latitude: 51.9141,
        longitude: 4.4777,
        city: "Rotterdam"
    }),
    rockpalast: new Location({
        name: "Rockpalast",
        url: "https://www.rockpalast.de/",
        latitude: 51.4811,
        longitude: 7.2165,
        city: "Bochum"
    }),
    simplon: new Location({
        name: "Simplon",
        url: "https://simplon.nl/",
        latitude: 53.2194,
        longitude: 6.568,
        city: "Groningen"
    }),
    sintannazaal: new Location({
        name: "Sint Anna zaal",
        url: "https://sint-anna-aalst-lokalen.be/",
        latitude: 50.9407287,
        longitude: 4.0146495,
        city: "Aalst"
    }),
    spiritof66: new Location({
        name: "Spirit of 66",
        url: "https://www.spiritof66.be/",
        latitude: 50.592,
        longitude: 5.8645,
        city: "Verviers"
    }),
    stadspark: new Location({
        name: "Stadspark",
        url: "https://stadsparkgroningen.nl/",
        latitude: 53.2044,
        longitude: 6.555,
        city: "Groningen"
    }),
    studio15: new Location({
        name: "Studio 15",
        url: "http://www.studio15talenthouse.nl/",
        latitude: 52.3639575,
        longitude: 6.6470012,
        city: "Almelo"
    }),
    sportpaleis: new Location({
        name: "Sportpaleis",
        url: "https://www.sportpaleis.be/",
        latitude: 51.2172,
        longitude: 4.4412,
        city: "Antwerpen"
    }),
    stevenskerk: new Location({
        name: "Stevenskerk",
        url: "https://www.stevenskerk.nl/",
        latitude: 51.8449,
        longitude: 5.8645,
        city: "Nijmegen"
    }),
    stroomhuis: new Location({
        name: "Stroomhuis",
        url: "https://www.stroomhuis.org/",
        latitude: 51.4416,
        longitude: 5.4697,
        city: "Eindhoven"
    }),
    tivolivredenburg: new Location({
        name: "Tivoli Vredenburg",
        url: "https://www.tivolivredenburg.nl/",
        latitude: 52.0907,
        longitude: 5.1214,
        city: "Utrecht"
    }),

    thejack: new Location({
        name: "The Jack",
        url: "https://www.thejack.nl/",
        latitude: 51.4384,
        longitude: 5.475,
        city: "Eindhoven"
    }),
    theloods: new Location({
        name: "The Loods",
        url: "https://www.theloodsroosendaal.nl/",
        latitude: 51.5305,
        longitude: 4.4653,
        city: "Roosendaal"
    }),
    tolhuistuin: new Location({
        name: "Tolhuistuin",
        url: "https://tolhuistuin.nl/",
        latitude: 52.384,
        longitude: 4.9003,
        city: "Amsterdam"
    }),
    trix: new Location({
        name: "Trix",
        url: "https://www.trixonline.be/",
        latitude: 51.2304,
        longitude: 4.4581,
        city: "Antwerpen"
    }),
    turbinenhalle: new Location({
        name: "Turbinenhalle",
        url: "https://www.turbinenhalle.de/",
        latitude: 51.4696,
        longitude: 6.854,
        city: "Oberhausen"
    }),
    turock: new Location({
        name: "Turock",
        url: "https://www.turock.de/",
        latitude: 51.4574,
        longitude: 7.013,
        city: "Essen"
    }),
    vera: new Location({
        name: "Vera",
        url: "https://www.vera-groningen.nl/",
        latitude: 53.2193,
        longitude: 6.5665,
        city: "Groningen"
    }),
    victorie: new Location({
        name: "Victorie",
        url: "https://www.podiumvictorie.nl/",
        latitude: 52.6311,
        longitude: 4.7485,
        city: "Alkmaar"
    }),
    v11: new Location({
        name: "V11",
        url: "https://www.vessel11.nl/",
        latitude: 51.9164,
        longitude: 4.484,
        city: "Rotterdam"
    }),
    volt: new Location({
        name: "Volt",
        url: "https://www.poppodiumvolt.nl/",
        latitude: 50.9994,
        longitude: 5.8665,
        city: "Sittard"
    }),

    vorstnationaal: new Location({
        name: "Vorst Nationaal",
        url: "https://www.vorstnationaal.be/",
        latitude: 50.8085,
        longitude: 4.3256,
        city: "Brussel"
    }),
    weertnoord: new Location({
        name: "Weert Noord",
        url: "https://www.weert.nl/",
        latitude: 51.2610822,
        longitude: 5.6837917,
        city: "Weert"
    }),
    wacken: new Location({
        name: "Wacken Open Air",
        url: "https://www.wacken.com/",
        latitude: 54.0226,
        longitude: 9.3755,
        city: "Duitsland"
    }),
    wieleman: new Location({
        name: "Wieleman",
        url: "https://www.wieleman.com/",
        latitude: 51.955,
        longitude: 5.967,
        city: "Westervoort"
    }),
    willemeen: new Location({
        name: "Willemeen",
        url: "https://www.willemeen.nl/",
        latitude: 51.9843,
        longitude: 5.9114,
        city: "Arnhem"
    }),
    willemtwee: new Location({
        name: "Willemtwee",
        url: "https://www.willem-twee.nl/",
        latitude: 51.6978,
        longitude: 5.3037,
        city: "Den Bosch"
    }),
    zappa: new Location({
        name: "Zappa",
        url: "https://www.zappa.be/",
        latitude: 51.1851,
        longitude: 4.4184,
        city: "Antwerpen"
    }),
    ziggodome: new Location({
        name: "Ziggodome",
        url: "https://www.ziggodome.nl/",
        latitude: 52.3144,
        longitude: 4.9378,
        city: "Amsterdam"
    }),
    zuiderpark: new Location({
        name: "Zuiderpark",
        url: "https://adodenhaag.nl/nl/",
        latitude: 52.061,
        longitude: 4.2765,
        city: "Den Haag"
    }),
    zag: new Location({
        name: "Zag Arena",
        url: "https://www.zag-arena.de/",
        latitude: 52.362,
        longitude: 9.737,
        city: "Hannover"
    })
};
export default locations;

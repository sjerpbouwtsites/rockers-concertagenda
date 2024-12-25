export const voluitEngels = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
};

export const kortEngels = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
};

export const voluitNederlands = {
    januari: "01",
    februari: "02",
    maart: "03",
    april: "04",
    mei: "05",
    juni: "06",
    juli: "07",
    augustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12"
};

export const kortNederlands = {
    jan: "01",
    feb: "02",
    mrt: "03",
    apr: "04",
    mei: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    okt: "10",
    nov: "11",
    dec: "12"
};

const podiumGebruikt = {
    "013": kortNederlands,
    afaslive: voluitNederlands,
    baroeg: voluitNederlands,
    bibelot: kortNederlands,
    boerderij: null,
    cpunt: voluitNederlands,
    dbs: voluitNederlands,
    deflux: voluitNederlands,
    dehelling: voluitNederlands,
    depul: kortNederlands,
    doornroosje: voluitNederlands,
    dynamo: kortNederlands,
    effenaar: kortNederlands,
    gebouwt: kortNederlands,
    gebrdenobel: voluitNederlands,
    groeneengel: kortNederlands,
    hatseflats: voluitNederlands,
    iduna: voluitNederlands,
    kavka: kortNederlands,
    littledevil: kortEngels,
    melkweg: kortNederlands,
    metalfan: kortNederlands,
    metropool: kortNederlands,
    neushoorn: voluitNederlands,
    nieuwenor: kortNederlands,
    occii: voluitEngels,
    oosterpoort: kortNederlands,
    p60: voluitNederlands,
    paradiso: kortEngels,
    patronaat: kortNederlands,
    ticketmaster: kortNederlands,
    tivolivredenburg: kortNederlands,
    victorie: kortNederlands,
    volt: voluitNederlands,
    willemeen: kortNederlands
};

export default function getVenueMonths(venueName) {
    if (!Object.prototype.hasOwnProperty.call(podiumGebruikt, venueName)) {
        throw new Error(`${venueName} niet in months.`);
    }
    return podiumGebruikt[venueName];
}

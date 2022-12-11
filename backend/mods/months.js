const voluitEngels = {
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
  december: "12",  
}

const voluitNederlands = {
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
  december: "12",  
}

const kortNederlands ={
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
  dec: "12",
}

const podiumGebruikt = {
  [`013`]: kortNederlands,
  baroeg: voluitNederlands,
  occii: voluitEngels,
  dynamo: kortNederlands,
  afaslive: voluitNederlands,
  boerderij: null,
  bibelot: voluitNederlands,
  dbs: voluitNederlands,
  depul: kortNederlands,
  deflux:voluitNederlands,
  doornroosje: voluitNederlands,
  duycker: kortNederlands,
  effenaar: kortNederlands,
  gebrdenobel: voluitNederlands,
  iduna: voluitNederlands,
  kavka: kortNederlands,
  metalfan: kortNederlands,
  melkweg: kortNederlands,
  metropool: kortNederlands,
  neushoorn: kortNederlands,
  oosterpoort: kortNederlands,
  paradiso: voluitNederlands,
  patronaat: kortNederlands,
  volt: kortNederlands,
  tivolivredenburg: kortNederlands,
}

export default function getVenueMonths(venueName){
  if (!Object.prototype.hasOwnProperty.call(podiumGebruikt, venueName)){
    throw new Error(`${venueName} niet in months.`)
  }
  return podiumGebruikt[venueName];
}


export const baroegMonths = voluitNederlands;
export const occiiMonths = voluitEngels;

export const dynamoMonths = kortNederlands;

export const afasliveMonths = baroegMonths;
export const bibelotMonths = baroegMonths;
export const dbsMonths = baroegMonths;
export const depulMonths = dynamoMonths;
export const doornRoosjeMonths = baroegMonths;
export const duyckerMonths = dynamoMonths;
export const effenaarMonths = dynamoMonths;
export const gebrdenobelMonths = baroegMonths;
export const idunaMonths = baroegMonths;
export const kavkaMonths = dynamoMonths;
export const metalfanMonths = dynamoMonths;
export const metropoolMonths = dynamoMonths;
export const neushoornMonths = baroegMonths;
export const paradisoMonths = baroegMonths;
export const patronaatMonths = dynamoMonths;
export const voltMonths = dynamoMonths;




import fs from 'fs';


const locatiesMetalfan = JSON.parse(fs.readFileSync('./event-lists/metalfan/0.json')).map(event => {
  return {
    location: event.location,
    title: event.title
  }
})

const aantalPerLocatie = {};

locatiesMetalfan.forEach(loc=>{
  const ll = loc.location;
  if (!aantalPerLocatie[ll]){
    aantalPerLocatie[ll] = {
      count: 1,
      names: []
    }
    aantalPerLocatie[ll].names.push(loc.title)
    return 
  }
  aantalPerLocatie[ll].count = aantalPerLocatie[ll].count + 1;
  aantalPerLocatie[ll].names.push(loc.title)
})

console.log(aantalPerLocatie)
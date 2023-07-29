import sharp from 'sharp';
import fs from "fs";
import {waitTime} from "./mods/tools.js"

function initLocationImagesConversion(){
  const eventImagesDestFolder = "/home/sjerp/dev/apache/concertagenda/public/location-images/";
  const eventImagesSourceFolder = "/home/sjerp/dev/apache/concertagenda/src/location-images/";
  let files = fs.readdirSync(eventImagesSourceFolder).map(file => {
    const fileZonder = file.replace(/.jpg|.jpeg|.png|.webp/,'')
    return {
      source: `${eventImagesSourceFolder}${file}`,
      dest: `${eventImagesDestFolder}${fileZonder}`,      
    }
  })
  
  recursiveFileConversion(files)
}

async function recursiveFileConversion(files){
  while (files.length){
    const thisFile = files.shift();
    await downloadImageCompress(thisFile.source, thisFile.dest);
  }  
}


async function downloadImageCompress(image, imagePath){

  sharp(image)
    .resize(440, 225)
    .webp()
    .toFile(`${imagePath}-w440.webp`, (err, info) => { 
      console.log(`klaar met ${image}`)
    });
  
  sharp(image)
    .resize(750, 360)
    .webp()
    .toFile(`${imagePath}-w750.webp`, (err, info) => { 
      console.log(`klaar met ${image}`)
    });

  sharp(image)
    .webp()
    .toFile(`${imagePath}-vol.webp`, (err, info) => { 
      console.log(`klaar met ${image}`)
    });    

  await waitTime(400)
}

initLocationImagesConversion()
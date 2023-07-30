import { getShellArguments } from "./mods/tools.js";
import fsDirections from "./mods/fs-directions.js";
import fs from 'fs';

export default async function houseKeeping() {

  const shellArguments = getShellArguments();
  const forceAll = shellArguments?.force?.includes('all');
  const forceTheseB = shellArguments?.force?.split(',') ?? [];
  const forceThese = forceTheseB.map(f => f.replace('%',''))
  const wipeBaseList = forceTheseB.filter(a=>a.includes('%')).map(f => f.replace('%',''))
  const curDay = (new Date()).toISOString().split('T')[0].replaceAll(/-/g,'')

  const removeTextsList = forceAll ? fs.readdirSync(fsDirections.publicTexts, 'utf-8') : forceThese;
  const removeImagesLocationsList = forceAll ? fs.readdirSync(fsDirections.publicEventImages, 'utf-8') : forceThese;
  
  fs.readdirSync(fsDirections.baseEventlists)
    .filter(baseEventList=>{
      return !baseEventList.includes(curDay)
    })
    .map(baseEventList => {
      return baseEventList.split('T')[0];
    })
    .forEach(toRemove=>{
      if (!removeTextsList.includes(toRemove)){
        removeTextsList.push(toRemove)
      }
      if (!removeImagesLocationsList.includes(toRemove)){
        removeImagesLocationsList.push(toRemove)
      }
    })
  
  removePublicTexts(removeTextsList)
  removePublicEventImages(removeImagesLocationsList)
  
  wipeBaseList.forEach(wipe=> {
    fs.readdirSync(fsDirections.baseEventlists).forEach(baseEventList=>{
      if (baseEventList.includes(wipe)){
        if (fs.existsSync(`${fsDirections.baseEventlists}/${baseEventList}`)){
          fs.rmSync(`${fsDirections.baseEventlists}/${baseEventList}`)
        }
      }
    })
  })

  return true;
  
}

function removePublicTexts(removeList){
  removeList.forEach(forceVal => {
    fs.readdirSync(`${fsDirections.publicTexts}/${forceVal}`).forEach(file => {
      fs.rmSync(`${fsDirections.publicTexts}/${forceVal}/${file}`)
    })
  })
}
function removePublicEventImages(removeImagesLocationsList){
  const pei = fsDirections.publicEventImages;
  removeImagesLocationsList.forEach(forced => {
    fs.readdirSync(`${pei}/${forced}`).forEach(file => {
      fs.rmSync(`${pei}/${forced}/${file}`)
    })      
  })
}

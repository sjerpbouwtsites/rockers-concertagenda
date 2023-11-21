import fs from 'fs';
import shell from './mods/shell.js';
import fsDirections from './mods/fs-directions.js';

function removePublicTexts(removeList) {
  removeList.forEach((forceVal) => {
    if (!fs.existsSync(`${fsDirections.publicTexts}/${forceVal}`)) {
      fs.mkdirSync(`${fsDirections.publicTexts}/${forceVal}`);
    }
    fs.readdirSync(`${fsDirections.publicTexts}/${forceVal}`).forEach((file) => {
      fs.rmSync(`${fsDirections.publicTexts}/${forceVal}/${file}`);
    });
  });
}
function removePublicEventImages(removeImagesLocationsList) {
  const pei = fsDirections.publicEventImages;
  removeImagesLocationsList.forEach((forced) => {
    if (!fs.existsSync(`${pei}/${forced}`)) {
      fs.mkdirSync(`${pei}/${forced}`);
    }    
    fs.readdirSync(`${pei}/${forced}`).forEach((file) => {
      fs.rmSync(`${pei}/${forced}/${file}`);
    });
  });
}

function makeRemoveTextsLists() {
  if (shell.keepBaseEvents) {
    return [];
  }
  if (shell.forceAll) {
    return fs.readdirSync(fsDirections.publicTexts, 'utf-8');
  }
  return shell.forceThese;
}

function makeRemoveImagesLocationsList() {
  if (shell.keepImages) {
    return [];
  }
  if (shell.forceAll) {
    return fs.readdirSync(fsDirections.publicEventImages, 'utf-8');
  }
  return shell.forceThese;
}

export default async function houseKeeping() {
  const forcedWipeList = shell.forceAndRemoveBaseEvents;
  const curDay = new Date().toISOString().split('T')[0].replaceAll(/-/g, '');

  const removeImagesLocationsList = makeRemoveImagesLocationsList();
  const removeTextsList = makeRemoveTextsLists();
  if (!shell.keepBaseEvents) {
    fs.readdirSync(fsDirections.baseEventlists)
      .filter((baseEventList) => !baseEventList.includes(curDay))
      .map((baseEventList) => baseEventList.split('T')[0])
      .forEach((toRemove) => {
        if (!removeTextsList.includes(toRemove)) {
          removeTextsList.push(toRemove);
        }
        if (!removeImagesLocationsList.includes(toRemove)) {
          removeImagesLocationsList.push(toRemove);
        }
      });
    removePublicTexts(removeTextsList);
  }

  if (!shell.keepImages) removePublicEventImages(removeImagesLocationsList);

  // als !keepBaseEvents, dan alles al gewist.
  if (!shell.keepBaseEvents) {
    fs.readdirSync(fsDirections.baseEventlists).forEach((baseEventList) => {
      const magWipen = shell.forceAll 
        ? true 
        : forcedWipeList.find((forcedWipe) => baseEventList.includes(forcedWipe));
      
      if (magWipen) {
        if (fs.existsSync(`${fsDirections.baseEventlists}/${baseEventList}`)) {
          fs.rmSync(`${fsDirections.baseEventlists}/${baseEventList}`);
        }
      }
    });
  }

  return true;
}

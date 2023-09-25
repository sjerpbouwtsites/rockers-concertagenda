import fs from 'fs';
import { getShellArguments } from './mods/tools.js';
import fsDirections from './mods/fs-directions.js';

function removePublicTexts(removeList) {
  removeList.forEach((forceVal) => {
    fs.readdirSync(`${fsDirections.publicTexts}/${forceVal}`).forEach((file) => {
      fs.rmSync(`${fsDirections.publicTexts}/${forceVal}/${file}`);
    });
  });
}
function removePublicEventImages(removeImagesLocationsList) {
  const pei = fsDirections.publicEventImages;
  removeImagesLocationsList.forEach((forced) => {
    fs.readdirSync(`${pei}/${forced}`).forEach((file) => {
      fs.rmSync(`${pei}/${forced}/${file}`);
    });
  });
}

function makeRemoveTextsLists(keepBaseEvents, forceAll, forceThese) {
  if (keepBaseEvents) {
    return [];
  }
  if (forceAll) {
    return fs.readdirSync(fsDirections.publicTexts, 'utf-8');
  }
  return forceThese;
}

function makeRemoveImagesLocationsList(keepImages, forceAll, forceThese) {
  if (keepImages) {
    return [];
  }
  if (forceAll) {
    return fs.readdirSync(fsDirections.publicEventImages, 'utf-8');
  }
  return forceThese;
}

export default async function houseKeeping() {
  const shellArguments = getShellArguments();

  /**
   * Als shell force en force=all
   */
  const forceAll = shellArguments?.force?.includes('all');

  /**
   * Als shell keepBaseEvents
   */
  const keepBaseEvents = shellArguments?.keepBaseEvents ?? false;

  /**
   * Als shell keepImages
   */
  const keepImages = shellArguments?.keepImages ?? false;
  /**
   * Aparte venues in shell force, als force null lege array
   */
  const forceThese = (shellArguments?.force?.split(',') ?? []).map((f) => f.replace('%', ''));
  /**
   * Welke venues èn force èn baselist moeten verliezen. Als force null lege array
   */
  const wipeBaseList = (shellArguments?.force?.split(',') ?? [])
    .filter((a) => a.includes('%'))
    .map((f) => f.replace('%', ''));
  const curDay = new Date().toISOString().split('T')[0].replaceAll(/-/g, '');

  const removeImagesLocationsList = makeRemoveImagesLocationsList(keepImages, forceAll, forceThese);
  const removeTextsList = makeRemoveTextsLists(keepBaseEvents, forceAll, forceThese);
  if (!keepBaseEvents) {
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

  if (!keepImages) removePublicEventImages(removeImagesLocationsList);

  // als !keepBaseEvents, dan alles al gewist.
  if (!keepBaseEvents) {
    wipeBaseList.forEach((wipe) => {
      fs.readdirSync(fsDirections.baseEventlists).forEach((baseEventList) => {
        if (baseEventList.includes(wipe)) {
          if (fs.existsSync(`${fsDirections.baseEventlists}/${baseEventList}`)) {
            fs.rmSync(`${fsDirections.baseEventlists}/${baseEventList}`);
          }
        }
      });
    });
  }

  return true;
}

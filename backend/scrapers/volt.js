import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import { voltMonths } from "../mods/months.js";
import AbstractScraper from "./abstract-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
const qwm = new QuickWorkerMessage(workerData);

const scraperConfig = {
  baseEventTimeout: 30000,
  singlePageTimeout: 15000,
  workerData: {}
}
const workerDataCopy = {
  ...workerData
}
for (let key in workerDataCopy){
  scraperConfig.workerData[key] = workerDataCopy
}

const voltScraper = new AbstractScraper(scraperConfig)

voltScraper.listenToMasterThread();

//

voltScraper.makeBaseEventList = async function (self) {
  const page = await self.browser.newPage();
  await page.goto("https://www.poppodium-volt.nl/", {
    waitUntil: "load",
  });

  try {
    await page.waitForSelector('.row.event', {
      timeout: 2500
    })
    await page.waitForSelector('.row.event .card-social', {
      timeout: 2500
    })
  } catch (error) {
    _t.handleError(error, 'Volt wacht op laden eventlijst')
  }

  let rawEvents = await page.evaluate(({ workerIndex }) => {

    return Array.from(document.querySelectorAll('.row.event .card'))
      .filter(rawEvent => {
        const hasGenreName = rawEvent.querySelector('.card-location')?.textContent.toLowerCase().trim() ?? '';
        return hasGenreName.includes('metal') || hasGenreName.includes('punk')
      })
      .map(rawEvent => {
        const anchor = rawEvent.querySelector('h3 [href*="programma"]') ?? null;
        const title = anchor?.textContent.trim() ?? '';
        const venueEventUrl = anchor.hasAttribute('href') ? anchor.href : null
        const image = rawEvent.querySelector('img')?.src ?? null;
        return {
          venueEventUrl,
          location: 'volt',
          title,
          image,
        }
      })
  }, { workerIndex: workerData.index });
  const baseMusicEvents = rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
    return {
      self,
      baseMusicEvents
    }
}

voltScraper.getPageInfo = async function ({page, url, self}) {

  try {
    await page.waitForSelector('#main .content-block', {
      timeout: 7500
    })
  } catch (error) {
    _t.handleError(error, this.workerData, 'Volt wacht op laden single pagina')
  }

  const result = await page.evaluate(({ voltMonths, url }) => {

    const res = {};
    const curMonthNumber = (new Date()).getMonth() + 1;
    const curYear = (new Date()).getFullYear();

    const contentBox = document.querySelector('#main .aside + div > .content-block') ?? null;
    if (contentBox) {
      res.longTextHTML = contentBox.innerHTML;
    }
    const unstyledListsInAside = document.querySelectorAll('#main .aside .list-unstyled') ?? [null];
    const startDateMatch = unstyledListsInAside[0].textContent.trim().toLowerCase()
      .match(/(\d{1,2})\s+(\w+)/) ?? null;
    let startDate;

    if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 3) {
      const day = startDateMatch[1].padStart(2, '0');
      const month = voltMonths[startDateMatch[2]];
      const year = Number(month) >= curMonthNumber ? curYear : curYear + 1;
      startDate = `${year}-${month}-${day}`;
      res.startDate = startDate;
    }

    const timesList = document.querySelector('#main .aside .prices ~ .list-unstyled')
    const timesMatch = timesList?.textContent.toLowerCase().match(/(\d\d:\d\d)/g) ?? null
    if (timesMatch && Array.isArray(timesMatch) && timesMatch.length >= 1) {

      let startTime, doorTime, endTime;
      if (timesMatch.length === 1) {
        startTime = timesMatch[0];
      } else if (timesMatch.length === 2) {
        doorTime = timesMatch[0];
        startTime = timesMatch[1];
      } else {
        doorTime = timesMatch[0];
        startTime = timesMatch[1];
        endTime = timesMatch[2];
      }
      try {
        if (startTime) {
          res.startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString()
        }
        if (doorTime) {
          res.doorOpenDateTime = new Date(`${startDate}T${doorTime}:00`).toISOString()
        }
        if (endTime) {
          res.endDateTime = new Date(`${startDate}T${endTime}:00`).toISOString()
        }

      } catch (error) {
        res.error = `ongeldige tijden: ${timesMatch.join(' ')}\n${error.message}`;
      }

    }
    res.priceTextcontent = document.querySelector('#main .aside .list-unstyled.prices')?.textContent ?? null;
    return res;
  }, { voltMonths, url });
  
  if (!result){
    throw Error(`page info empty`)
  }

  if (result.error) {
    _t.handleError(new Error(result.error), workerData, 'getPageInfo')
  }

  return result

}








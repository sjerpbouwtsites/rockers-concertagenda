import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const afasliveScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 40000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://www.afaslive.nl/agenda",
        requiredProperties: ['venueEventUrl']
      }
    }
  }
}));

afasliveScraper.singleEventCheck = afasliveScraper.isRock;

afasliveScraper.listenToMasterThread();

// MAKE BASE EVENTS

afasliveScraper.makeBaseEventList = async function () {
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page); // TODO hier wat aan doen. maak er een do while van met een timeout. dit is waardeloos.

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".agenda__item__block "))
      .filter((event, index) => index % workerData.workerCount === workerData.index)
      .map((agendaBlock) => {

        const title = agendaBlock.querySelector(".eventTitle")?.textContent ?? "";
        const res = {
          unavailable: "",
          pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title
        }
        res.venueEventUrl = agendaBlock.querySelector("a")?.href ?? null;
        res.image = agendaBlock.querySelector("img")?.src ?? null;
        return res;
      });
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};

afasliveScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months,event }) => {

      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      const startDateMatch =
        document
          .querySelector(".eventTitle")
          ?.parentNode.querySelector("time")
          ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
      if (
        startDateMatch &&
        Array.isArray(startDateMatch) &&
        startDateMatch.length > 3
      ) {
        res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${
          startDateMatch[1]
        }`;
      } else {
        res.unavailable += 'Geen start date.';
        // debugger doen.
        return res;
      }

      const startEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid ~ p.align-mid"
      );
      if (startEl) {
        const startmatch = startEl.textContent.match(/\d\d:\d\d/);
        if (startmatch && Array.isArray(startmatch) && startmatch.length) {
          res.startTime = startmatch[0];
        } else {
          res.unavailable += 'Geen start tijd.';
          // debugger doen.
          return res;          
        }
      }

      const doorEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid"
      );
      if (doorEl) {
        const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
        if (doormatch && Array.isArray(doormatch) && doormatch.length) {
          res.doorTime = doormatch[0];
        }
      }

      try {
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        }

        if (res.doorTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `tijd en datum samenvoegen ${res.pageInfo}`,
          // TODO debugger error samen time en date ${res.startDate}T${res.startTime}:00 ${res.startDate}T${res.doorTime}:00
        });
        res.unavailable += 'geen starttijd wegens fout';
        return res;
      }

      res.soldOut = !!(document.querySelector('#tickets .soldout') ?? null)

      res.longTextHTML = 
        document.querySelector("article .wysiwyg")?.innerHTML ?? '';

      res.priceTextcontent = 
        document.querySelector("#tickets")?.textContent.trim() ?? '';
      return res;
    },
    { months: this.months,event }
  );
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
};

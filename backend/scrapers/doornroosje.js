import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import { doornRoosjeMonths } from "../mods/months.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 35000,
  singlePageTimeout: 25000,
  workerData: Object.assign({}, workerData),
};
const doornroosjeScraper = new AbstractScraper(scraperConfig);

doornroosjeScraper.listenToMasterThread();

// MAKE BASE EVENTS

doornroosjeScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);

  const page = await this.browser.newPage();
  await page.goto(
    "https://www.doornroosje.nl/?genre=metal%252Cpunk%252Cpost-hardcore%252Cnoise-rock%252Csludge-rock",
    {
      waitUntil: "load",
    }
  );
  await page.waitForSelector(".c-program__title");
  await _t.waitFor(50);
  //await page.waitForTimeout(2500); mogelijk ff wachten op selector

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".c-program__item"))
      .filter((eventEl, index) => {
        return index % 3 === workerIndex;
      }) // de deling van die index afhankelijk van workerData.
      .map((eventEl) => {
        const res = {
          unavailable: null,
        };
        res.title =
          eventEl.querySelector(".c-program__title")?.textContent.trim() ??
          eventEl.querySelector("h1,h2,h3")?.textContent.trim();
        null;
        res.shortText =
          eventEl
            .querySelector(".c-program__content")
            ?.textContent.trim()
            .replace(res.title, "") ?? null;
        res.venueEventUrl = eventEl?.href;
        if (!res.title || !res.venueEventUrl) {
          res.unavailable = "title of url ontbreken";
        }
        res.location = "doornroosje";
        return res;
      });
  }, workerData.index);
  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();
  return rawEvents
    .map((event) => {
      (!event.venueEventUrl || !event.title) &&
        parentPort.postMessage(
          this.qwm.messageRoll(
            `Red het niet: <a href='${event.venueEventUrl}'>${event.title}</a> ongeldig.`
          )
        );
      return event;
    })
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

doornroosjeScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);

  const pageInfo = await page.evaluate((months) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.image =
      document.querySelector(".c-header-event__image img")?.src ?? null;
    res.priceTextcontent =
      document.querySelector(".c-btn__price")?.textContent.trim() ?? null;
    res.longTextHTML =
      document.querySelector(".s-event__container")?.innerHTML ?? null;

    const embeds = document.querySelectorAll(".c-embed");
    res.longTextHTML =
      embeds?.length ?? false
        ? res.longTextHTML + embeds.innerHTML
        : res.longTextHTML;

    const startDateRauwMatch = document
      .querySelector(".c-event-data")
      ?.innerHTML.match(
        /(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(\d{4})/
      ); // welke mongool schrijft zo'n regex
    let startDate;
    if (startDateRauwMatch && startDateRauwMatch.length) {
      const day = startDateRauwMatch[1];
      const month = months[startDateRauwMatch[2]];
      const year = startDateRauwMatch[3];
      startDate = `${year}-${month}-${day}`;
    } else {
      res.unavailable = "geen startdatum gevonden. ";
    }

    if (startDate) {
      const timeMatches = document
        .querySelector(".c-event-data")
        .innerHTML.match(/\d\d:\d\d/g);

      if (timeMatches && timeMatches.length) {
        try {
          if (timeMatches.length == 2) {
            res.startDateTime = new Date(
              `${startDate}:${timeMatches[1]}`
            ).toISOString();
            res.doorOpenDateTime = new Date(
              `${startDate}:${timeMatches[0]}`
            ).toISOString();
          } else if (timeMatches.length == 1) {
            res.startDateTime = new Date(
              `${startDate}:${timeMatches[0]}`
            ).toISOString();
          }
        } catch (error) {
          errorsVoorErrorHandler.push({
            error,
            remarks:
              "fout bij tijd of datums. matches: " +
              timeMatches +
              " datum: " +
              startDate,
          });
        }
      } else {
        res.unavailable += `geen tijden gevonden. `;
      }
    }
    if (res.unavailable) {
      res.unavailable += res.pageInfoID;
    }
    return res;
  }, doornRoosjeMonths);

  pageInfo?.errorsVoorErrorHandler?.forEach((errorHandlerMeuk) => {
    _t.handleError(
      errorHandlerMeuk.error,
      workerData,
      errorHandlerMeuk.remarks
    );
  });

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }
  return pageInfo;
};

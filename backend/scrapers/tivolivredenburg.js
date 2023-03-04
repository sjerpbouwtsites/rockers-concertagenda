import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const tivoliVredenburgScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      waitUntil: "load"
    },
    app: {
      mainPage: {
        url: "https://www.tivolivredenburg.nl/agenda/?event_category=metal-punk-heavy",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }    
  }
}));

tivoliVredenburgScraper.listenToMasterThread();

// MAKE BASE EVENTS

tivoliVredenburgScraper.makeBaseEventList = async function () {
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".agenda-list-item"))
      .filter((eventEl,index) => index % workerData.workerCount === workerData.index)
      .map((eventEl) => {
        const res = {};
        res.title =
          eventEl
            .querySelector(".agenda-list-item__title")
            ?.textContent.trim() ?? null;
        res.shortText =
          eventEl
            .querySelector(".agenda-list-item__text")
            ?.textContent.trim() ?? '';
        res.image =
          eventEl
            .querySelector(".agenda-list-item__figure img")
            ?.src.replace(/-\d\d\dx\d\d\d.jpg/, ".jpg") ?? null;
        res.venueEventUrl = eventEl.querySelector(
          ".agenda-list-item__title-link"
        ).href;
        res.soldOut = !!(eventEl.querySelector(".agenda-list-item__label")?.textContent.toLowerCase().includes('uitverkocht') ?? null)
        return res;
      });
  }, {workerData});

  this.dirtyLog(rawEvents)

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );

};

// GET PAGE INFO

tivoliVredenburgScraper.getPageInfo = async function ({ page }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(() => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.priceTextcontent =
      document.querySelector(".btn-group__price")?.textContent.trim() ?? '';
    res.priceContexttext =
      document.querySelector(".event-cta")?.textContent.trim() ?? '';
    res.longTextHTML = 
      document.querySelector(".event__text")?.innerHTML ?? '';

    const startDateMatch = document.location.href.match(/\d\d-\d\d-\d\d\d\d/); //
    res.startDate = "";
    if (startDateMatch && startDateMatch.length) {
      res.startDate = startDateMatch[0].split("-").reverse().join("-");
    }

    if (!res.startDate || res.startDate.length < 7) {
      res.unavailable = "startdate gaat mis";
      res.errorsVoorErrorHandler({
        error: new Error(
          `Startdate mist / niet goed genoeg<br>${startDateMatch.join(
            "; "
          )}<br>${res.startDate}`
        ),
      });
    }
    const eventInfoDtDDText = document
      .querySelector(".event__info .description-list")
      ?.textContent.replace(/[\n\r\s]/g, "")
      .toLowerCase();
    res.startTime = null;
    res.openDoorTime = null;
    res.endTime = null;
    const openMatch = eventInfoDtDDText.match(/open.*(\d\d:\d\d)/);
    const startMatch = eventInfoDtDDText.match(/aanvang.*(\d\d:\d\d)/);
    const endMatch = eventInfoDtDDText.match(/einde.*(\d\d:\d\d)/);

    if (Array.isArray(openMatch) && openMatch.length > 1) {
      try {
        res.openDoorTime = openMatch[1];
        res.doorOpenDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.openDoorTime}:00`).toISOString()
          : null;
      } catch (error) {
        res.errorsVoorErrorHandler({
          error,
          remarks: `Open door ${eventInfoDtDDText}`,
        });
      }
    }
    if (Array.isArray(startMatch) && startMatch.length > 1) {
      try {
        res.startTime = startMatch[1];
        res.startDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
          : null;
      } catch (error) {
        res.errorsVoorErrorHandler({
          error,
          remarks: `startTijd door ${startMatch.join("")}`,
        });
        res.unavailable = `${res.unavailable}  geen start tijd.`;
      }
    }
    if (Array.isArray(endMatch) && endMatch.length > 1) {
      try {
        res.endTime = endMatch[1];
        res.endDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.endTime}:00`).toISOString()
          : null;
      } catch (error) {
        res.errorsVoorErrorHandler({
          error,
          remarks: `endtijd ${eventInfoDtDDText}`,
        });
      }
    }

    return res;
  }, null);

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};

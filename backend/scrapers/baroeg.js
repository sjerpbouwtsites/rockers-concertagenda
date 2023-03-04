import axios from "axios";
import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const baroegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 45000,
    },
    singlePage: {
      timeout: 15000
    },
    app: {
      mainPage: {
        url: "https://zieconcreet.nl/hieronder",
        useCustomScraper: true,
        requiredProperties: ['venueEventUrl', 'title']
      }
    }    
  }
}));

baroegScraper.listenToMasterThread();

// MAKE BASE EVENTS

baroegScraper.makeBaseEventList = async function () {

  const {stopFunctie} = await this.makeBaseEventListStart()

  const baroegLijst = await axios
    .get(
      `https://baroeg.nl/wp-json/wp/v2/wp_theatre_prod?_embed&per_page=10&offset=${
        workerData.index * 10
      }&modified_after=2022-10-01T00:00:00Z`
    )
    .then((response) => {
      return response.data;
    })
    .catch((response) => {
      _t.handleError(
        response,
        workerData,
        "axios get baroeg wp json fail makeBaseEventList"
      );
    });

  if (!baroegLijst) return [];

  const rawEvents = baroegLijst.map((event) => {
    const res = {};
    res.title = event.title.rendered;
    res.shortText = event.excerpt.rendered;
    res.image =
      event?._embedded?.[
        "wp:featuredmedia"
      ][0]?.media_details?.sizes?.medium_large?.source_url;
    res.venueEventUrl = event?.link;
    return res;
  });

  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents}
  );

};

// GET PAGE INFO

baroegScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: null,
        pageInfoID: `<a href='${document.location.href}'>💻</a>`,
      };
      //TODO is dit legacy? check of tickets beschikbaar zijn? Gaat naar de soldOut toch
      // const ticketsEl = document.querySelector(".wp_theatre_event_tickets");
      // if (!ticketsEl) {
      //   res.unavailable = `Geen kaarten. `;
      // }

      const startDateEl = document.querySelector(".wp_theatre_event_startdate");
      if (!startDateEl) {
        res.unavailable = `${res.unavailable ?? ""} no start date.`;
      }
      const startDateMatch =
        document
          .querySelector(".wp_theatre_event_startdate")
          ?.textContent.toLowerCase()
          .match(/(\w+)\s+(\d{1,2}).+(\d{4})/) ?? null;
      let startTime = document
        .querySelector(".wp_theatre_event_starttime")
        ?.textContent.toLowerCase()
        .trim();

      if (
        !Array.isArray(startDateMatch) ||
        startDateMatch.length < 4 ||
        !startTime
      ) {
        res.unavailable = `${res.unavailable ?? ""} incorrect startDate.`;
      } else {
        let [, monthName, day, year] = startDateMatch;
        let month = months[monthName];
        day = day.padStart(2, "0");

        startTime = startTime.padStart(5, "0");
        res.startDateTime = new Date(
          `${year}-${month}-${day}T${startTime}:00`
        ).toISOString();
      }

      res.priceTextcontent =
        document.querySelector(".wp_theatre_event_tickets")?.textContent ??
        '';
      res.contextText = document.getElementById("content")?.textContent ?? '';

      const postContent = document.querySelector('.single-post .post-content') ?? null;
      if (postContent){
        const postHeading = postContent.querySelector('.wpt_events') ?? null;
        if (postHeading) {
          postContent.removeChild(postHeading)
        }
        const someH3 = postContent.querySelector('h3') ?? null;
        if (someH3) {
          postContent.removeChild(someH3)
        }
        res.longTextHTML = postContent.innerHTML;
      }
      res.soldOut = !!(document.querySelector('.wp_theatre_event_tickets_status_soldout') ?? null)
      

      if (res.unavailable) {
        res.unavailable = `${res.unavailable} ${res.pageInfoID}`;
      }
      return res;
    },
    { months: this.months }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};



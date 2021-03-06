import MusicEvent from "./music-event.js";
import { Location } from "./locations.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import { metalfanMonths } from "./months.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeMetalfan);

async function scrapeMetalfan() {
  const browser = await puppeteer.launch();
  await getBaseMusicEvents(browser);
  parentPort.postMessage({
    status: "done",
    message: "metalfan worker done.",
  });
  EventsList.save("metalfan");
  try {
    browser.close();
  } catch (error) { }
}

async function getBaseMusicEvents(browser) {
  const page = await browser.newPage();
  await page.goto(`https://www.metalfan.nl/agenda.php`);

  const eventData = await page.evaluate((months) => {
    return Array.from(document.querySelectorAll(".calentry")).map(
      (metalfanEvent) => {
        let dateAnchorEl,
          eventDate,
          eventNameEl,
          eventHTML,
          eventName,
          eventHTMLrules,
          eventLocationName,
          shortText;

        dateAnchorEl = metalfanEvent.querySelector("a[name]");
        eventDate = !!dateAnchorEl
          ? new Date(dateAnchorEl.getAttribute("name")).toISOString()
          : null;
        if (!eventDate) {
          const metalfanEventCaldateEl =
            metalfanEvent.querySelector(".caldate");
          if (metalfanEventCaldateEl) {
            const caldateTC = metalfanEventCaldateEl.textContent;
            const dayString = caldateTC.match(/\d+/)[0].padStart(2, "0");
            const monthString = caldateTC.match(/[a-z]{3}/)[0].trim();
            const monthNumber = months[monthString];
            eventDate =
              monthNumber && dayString
                ? new Date(`2022-${monthNumber}-${dayString}`).toISOString()
                : null;
          }
        }
        eventNameEl = metalfanEvent.querySelector(".event");
        eventName = !!eventNameEl
          ? eventNameEl.textContent.trim()
          : "geen naam!";

        eventNameEl.parentNode.removeChild(eventNameEl);
        eventHTML = metalfanEvent.querySelector(".calevent").innerHTML;
        let eventCommaSplice = metalfanEvent
          .querySelector(".calevent")
          .textContent.split(",");
        eventLocationName = (eventCommaSplice[0] || "").trim();

        eventHTMLrules = eventHTML.split("<br>");
        shortText =
          eventHTMLrules.length > 1
            ? (eventHTMLrules[eventHTMLrules.length - 1] || "").trim()
            : "";

        return {
          title: eventName,
          startDateTime: eventDate,
          eventLocationName,
          shortText: shortText,
        };
      }
    );
  }, metalfanMonths);

  const musicEvents = eventData
    .map((eventDatum) => {
      const thisMusicEvent = new MusicEvent(eventDatum);
      const locationName = Location.makeLocationSlug(
        eventDatum.eventLocationName
      );

      if (
        [
          "013",
          "afaslive",
          "baroeg",
          "bibelot",
          "boerderij",
          "dbs",
          "doornroosje",
          "dynamo",
          "effenaar",
          "gebrdenobel",
          "iduna",
          "kavka",
          "melkweg",
          "metropool",
          "metropoolopenair",
          "merleyn", // onderdeel doornroosje
          'neushoorn',
          "occii",
          "patronaat",
          "tivolivredenburg",
        ].includes(locationName)
      ) {
        return;
      }

      thisMusicEvent.location = locationName;
      return thisMusicEvent;
    })
    .filter((musicEvent) => {
      return musicEvent;
    });

  musicEvents.forEach((musicEvent) => {
    musicEvent.register();
  });

  return true;
}

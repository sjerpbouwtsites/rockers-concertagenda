import MusicEvent from "../mods/music-event.js";
import { Location } from "../mods/locations.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import * as _t from "../mods/tools.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
import getVenueMonths from "../mods/months.js";
import { workerConfig } from "../mods/worker-config.js";

parentPort.on("message", (message) => {
  const pm = JSON.parse(message);
  if (pm?.type === "process" && pm?.subtype === "command-start") {
    try {
      scrapeMetalfan(pm?.messageData);
    } catch (error) {
      parentPort.postMessage({
        status: "error",
        message: error,
      });
    }
  }
});

async function scrapeMetalfan() {
  try {
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.workerInitialized());
    const browser = await puppeteer.launch();
    await getBaseMusicEvents(browser, qwm);
    parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
    EventsList.save("metalfan");
    browser.close();
  } catch (error) {
    _t.handleError(error, workerData, `metal fan outer catch`, 'close-thread', null);
  }
}

async function getBaseMusicEvents(browser, qwm) {
  const page = await browser.newPage();
  await page.goto(`https://www.metalfan.nl/agenda.php`);
  parentPort.postMessage(qwm.workerStarted());

  const workerNames = Object.keys(workerConfig);
  const skipWithMetalfan = workerNames.concat([
    "metropoolopenair",
    "013tilburg",
    "013enomgevingn",
    "slvesborg", 
    "cultuurpodiumboerderij",
    "royalparklive",
  ]);

  const rename = {
    "013enomgevingen": "013",
    "013enomgeving": "013",
    "013enomgevingn": "013",
    "botanique brussel": "botanique",
    "decacaofabriek":"cacaofabriek",
    "desselbelgimetoaslipknot": "dessel",
    "desselbelgimetoagunsnroses": "dessel",
    "dinkelsbhlmetoapowerwolf": "dinkel",
    "dynamo eindhoven": "dynamo",
    "dynamoeindhoven": "dynamo",
    "kopenhagendenemarkenmetmtleycre": "kopenhagen",
    "kavka antwerpen": "kavka",
    "kavka oudaan": "kavka",
    "kavkaoudaan": "kavka",
    "kavka zappa": "kavka",
    "kavkazappa": "kavka",    
    "kavkaantwerpen": "kavka",
    "langemunt": "langemunte",
    "merleyn": "doornroosje", // onderdeel doornroosje
    "oilsjt omploft": "sintannazaal",
    "wackenduitsland": 'wacken',
    "wackenduitslandmetoamegadeth": "wacken",
    "wackenduitslandmetoaironmaiden": "wacken",
    "evenemententerreinweertnoord":"weertnoord",
    "ysselsteyn": "ijsselstein",
  }

  const eventData = await page.evaluate(({months, rename}) => {
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
        eventDate =
          metalfanEvent.contains(dateAnchorEl) &&
          new Date(dateAnchorEl.getAttribute("name")).toISOString();
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
        eventName = metalfanEvent.contains(eventNameEl)
          ? eventNameEl.textContent.trim()
          : "geen naam!";

        eventNameEl.parentNode.removeChild(eventNameEl);
        eventHTML = metalfanEvent.querySelector(".calevent").innerHTML;
        let eventCommaSplice = metalfanEvent
          .querySelector(".calevent")
          .textContent.split(",");
        eventLocationName = (eventCommaSplice[0] || "").trim();
        if (Object.prototype.hasOwnProperty.call(rename, eventLocationName.toLowerCase())) {
          eventLocationName = rename[eventLocationName.toLowerCase()]
        }

        eventHTMLrules = eventHTML.split("<br>");
        shortText = 
          eventHTMLrules.length > 1
            ? (eventHTMLrules[eventHTMLrules.length - 1] || "")
            : "";

        return {
          title: eventName,
          startDateTime: eventDate,
          eventLocationName,
          shortText: shortText,
        };
      }
    );
  }, {months: getVenueMonths('metalfan'), rename});

  const musicEvents = eventData
    .map((eventDatum) => {
      const thisMusicEvent = new MusicEvent(eventDatum);
      const locationName = Location.makeLocationSlug(
        eventDatum.eventLocationName
      );

      if (skipWithMetalfan.includes(locationName)) {
        return;
      }
      thisMusicEvent.location = locationName;
      return thisMusicEvent;
    })
    .filter((musicEvent) => {
      return musicEvent && musicEvent.location;
    })
    .filter(musicEvent => {
      return !skipWithMetalfan.includes(musicEvent.location)
    });

  


  musicEvents.forEach((musicEvent) => {
    musicEvent.register();
  });

  return true;
}

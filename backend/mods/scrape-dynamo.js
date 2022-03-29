import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fsDirections from "./fs-directions.js";
import fs from "fs";
import crypto from "crypto";
import { getPriceFromHTML } from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeDynamo);

async function scrapeDynamo(workerIndex) {
  const months = {
    jan: "01",
    feb: "02",
    mrt: "03",
    apr: "04",
    mei: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    okt: "10",
    nov: "11",
    dec: "12",
  };

  const browser = await puppeteer.launch();

  const baseMusicEvents = await makeBaseEventList(browser, workerIndex, months);
  const filledMusicEvents = await fillMusicEvents(
    browser,
    baseMusicEvents,
    months,
    workerIndex
  );

  parentPort.postMessage({
    status: "done",
    message: `Dynamo worker-${workerIndex} done.`,
  });
  EventsList.save("dynamo");
  setTimeout(() => {
    browser.close();
  }, 5000);
}

async function fillMusicEvents(browser, baseMusicEvents, months, workerIndex) {
  const baseMusicEventsCopy = [...baseMusicEvents];
  parentPort.postMessage({
    status: "working",
    message: `will scrape ${baseMusicEvents.length} events.`,
  });

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    months,
    workerIndex
  );
}

async function processSingleMusicEvent(
  browser,
  baseMusicEvents,
  months,
  workerIndex
) {
  if (baseMusicEvents.length % 3 === 0) {
    parentPort.postMessage({
      status: "console",
      message: `🦾 Dynamo worker-${workerIndex} has still ${baseMusicEvents.length} todo.`,
    });
  }

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();
  if (baseMusicEvents.length === 0 || !firstMusicEvent) {
    return true;
  }
  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl);
  const pageInfo = await getPageInfo(page, months);

  if (pageInfo && pageInfo.priceTextContent) {
    firstMusicEvent.price = getPriceFromHTML(pageInfo.priceTextContent);
  }

  firstMusicEvent.merge(pageInfo);

  if (pageInfo.startTime) {
    const tempDate = new Date(firstMusicEvent.startDateTime);
    const startTimeSplit = pageInfo.startTime.split(":");
    tempDate.setHours(startTimeSplit[0]);
    tempDate.setMinutes(startTimeSplit[1]);
    firstMusicEvent.startDateTime = tempDate;
  }
  if (pageInfo.doorOpen) {
    const tempDate = new Date(firstMusicEvent.startDateTime);
    const doorOpenSplit = pageInfo.doorOpen.split(":");
    tempDate.setHours(doorOpenSplit[0]);
    tempDate.setMinutes(doorOpenSplit[1]);
    firstMusicEvent.doorOpenDateTime = tempDate;
  }
  if (pageInfo.endTime) {
    const tempDate = new Date(firstMusicEvent.startDateTime);
    const endTimeSplit = pageInfo.endTime.split(":");
    tempDate.setHours(endTimeSplit[0]);
    tempDate.setMinutes(endTimeSplit[1]);
    firstMusicEvent.endDateTime = tempDate;
  }

  firstMusicEvent.register();

  page.close();

  if (newMusicEvents.length) {
    return processSingleMusicEvent(
      browser,
      newMusicEvents,
      months,
      workerIndex
    );
  } else {
    return true;
  }
}

async function getPageInfo(page, months) {
  const pageInfo = await page.evaluate(
    ({ months }) => {
      // two fucking tables
      const agendaDatesEls = document.querySelectorAll(".agenda-date");
      let doorOpen;
      let startTime;
      let endTime;
      let priceTextContent;
      if (agendaDatesEls && agendaDatesEls.length > 1) {
        const leftHandSideTableTRs = agendaDatesEls[0].querySelectorAll("tr");
        const rightHandSideTableTRs = agendaDatesEls[1].querySelectorAll("tr");

        if (leftHandSideTableTRs.length) {
          leftHandSideTableTRs.forEach((row) => {
            const timeInRow = row.textContent.replace(/\D/g, "");
            if (row.textContent.includes("Doors")) {
              doorOpen = `${timeInRow[0]}${timeInRow[1]}:${timeInRow[2]}${timeInRow[3]}`;
            }
            if (
              row.textContent.includes("Einde") ||
              row.textContent.includes("End")
            ) {
              endTime = `${timeInRow[0]}${timeInRow[1]}:${timeInRow[2]}${timeInRow[3]}`;
            }
            if (
              row.textContent.includes("Start") ||
              row.textContent.includes("Aanvang")
            ) {
              startTime = `${timeInRow[0]}${timeInRow[1]}:${timeInRow[2]}${timeInRow[3]}`;
            }
          });
        }

        priceTextContent = agendaDatesEls[1].textContent;
      }
      const longTextHTMLEl = document.querySelector(
        "section.article .article-block"
      );
      const longTextHTML = !!longTextHTMLEl ? longTextHTMLEl.innerHTML : "";

      const backgroundImage = document.querySelector(
        ".dynamic-background-color#intro .color-pick"
      );
      let image;
      if (backgroundImage) {
        const bgImgMatch =
          backgroundImage.style.backgroundImage.match(/(https.*\.jpg)/);
        if (bgImgMatch && bgImgMatch.length) {
          image = bgImgMatch[0].replace("-500x500x", "");
        }
      }
      const dataIntegrity = 10;

      return {
        doorOpen,
        startTime,
        endTime,
        priceTextContent,
        longTextHTML,
        image,
        dataIntegrity,
      };
    },
    { months }
  );

  let uuid = crypto.randomUUID();
  const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
  pageInfo.longText = longTextPath;

  fs.writeFileSync(longTextPath, pageInfo.longTextHTML, "utf-8");

  page.close();
  return pageInfo;
}

async function makeBaseEventList(browser, workerIndex, months) {
  const page = await browser.newPage();
  await page.goto(
    "https://www.dynamo-eindhoven.nl/programma/?_sfm_fw%3Aopt%3Astyle=15"
  );
  const dynamoRock = await page.evaluate(
    ({ months, workerIndex }) => {
      return Array.from(
        document.querySelectorAll(".search-filter-results .timeline-article")
      )
        .filter((baseEvent, index) => {
          return (index + workerIndex) % 2 === 0;
        })
        .map((baseEvent) => {
          const venueEventUrl = baseEvent.querySelector("a")?.href ?? "";
          const title = baseEvent.querySelector("h4")?.textContent ?? "";
          const location = "dynamo";

          const timelineInfoContainerEl = baseEvent.querySelector(
            ".timeline-info-container"
          );
          let shortText, dateDay, dateMonth, dateYear;
          if (timelineInfoContainerEl) {
            shortText = timelineInfoContainerEl.querySelector("p").textContent;
            const dateBasis =
              timelineInfoContainerEl.querySelector(".date").textContent;
            const dateSplit = dateBasis.split("/").map((str) => str.trim());
            if (dateSplit.length < 3) {
              return;
            }
            dateDay = dateSplit[0].replace(/\D/g, "");
            dateMonth = months[dateSplit[1].trim()];
            dateYear = dateSplit[2];
          }
          return {
            venueEventUrl,
            title,
            location,
            shortText,
            dateDay,
            dateMonth,
            dateYear,
          };
        });
    },
    { months, workerIndex }
  );

  const basicEvents = dynamoRock.map((event) => {
    const baseDate = `${event.dateYear}-${event.dateMonth}-${event.dateDay}`;
    event.startDateTime = new Date(baseDate).toISOString();
    return new MusicEvent(event);
  });
  page.close();

  return basicEvents;
}

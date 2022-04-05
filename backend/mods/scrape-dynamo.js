import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fsDirections from "./fs-directions.js";
import fs from "fs";
import crypto from "crypto";
import {
  getPriceFromHTML,
  basicMusicEventsFilter,
  postPageInfoProcessing,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";
import { dynamoMonths } from "./months.js";

letScraperListenToMasterMessageAndInit(scrapeDynamo);

async function scrapeDynamo(workerIndex) {
  const browser = await puppeteer.launch();

  const baseMusicEvents = await makeBaseEventList(browser, workerIndex);
  const filledMusicEvents = await fillMusicEvents(
    browser,
    baseMusicEvents,
    workerIndex
  );

  parentPort.postMessage({
    status: "done",
    message: `Dynamo worker-${workerIndex} done.`,
  });
  EventsList.save("dynamo", workerIndex);
  setTimeout(() => {
    browser.close();
  }, 5000);
}

async function fillMusicEvents(browser, baseMusicEvents, workerIndex) {
  const baseMusicEventsCopy = [...baseMusicEvents];

  return processSingleMusicEvent(browser, baseMusicEventsCopy, workerIndex);
}

async function processSingleMusicEvent(browser, baseMusicEvents, workerIndex) {
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();
  if (baseMusicEvents.length === 0 || !firstMusicEvent) {
    return true;
  }
  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl);
  let pageInfo = await getPageInfo(page);
  pageInfo = postPageInfoProcessing(pageInfo);
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
  firstMusicEvent.merge(pageInfo);
  if (firstMusicEvent.isValid) {
    firstMusicEvent.register();
  }

  page.close();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}

async function getPageInfo(page) {
  const pageInfo = await page.evaluate(() => {
    // two fucking tables
    const agendaDatesEls = document.querySelectorAll(".agenda-date");
    let doorOpen;
    let startTime;
    let endTime;
    let priceTextcontent;
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

      priceTextcontent = agendaDatesEls[1].textContent;
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
      priceTextcontent,
      longTextHTML,
      image,
      dataIntegrity,
    };
  }, null);

  page.close();
  return pageInfo;
}

async function makeBaseEventList(browser, workerIndex) {
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
    { months: dynamoMonths, workerIndex }
  );

  const basicEvents = dynamoRock
    .map((event) => {
      const baseDate = `${event.dateYear}-${event.dateMonth}-${event.dateDay}`;
      event.startDateTime = new Date(baseDate).toISOString();
      return new MusicEvent(event);
    })
    .filter(basicMusicEventsFilter);
  page.close();

  return basicEvents;
}

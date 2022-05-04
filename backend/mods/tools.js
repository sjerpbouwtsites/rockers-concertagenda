import { parentPort } from "worker_threads";
import fs from "fs";
import fsDirections from "./fs-directions.js";
import crypto from "crypto";

export function handleError(error) {
  parentPort.postMessage({
    status: "error",
    message: error,
  });
  const time = new Date();
  const curErrorLog = fs.readFileSync(fsDirections.errorLog) || "";
  const newErrorLog = `
  Baroeg Error - ${error.name} - ${time.toLocaleTimeString()}
  ${error.stack} 
  ${error.message}
  
  ${curErrorLog}`;

  fs.writeFileSync(fsDirections.errorLog, newErrorLog, "utf-8");
}

export async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 500;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
}

export function errorAfterSeconds(time = 10000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error("REJECTED AFTER " + time));
    }, time);
  });
}

export function getPriceFromHTML(testText = null, contextText = null) {
  if (!testText) {
    return getPriceFromHTML(contextText);
  }

  const priceMatch = testText.match(/((\d{1,3})[,.]+(\d\d|-))/);

  if (
    !priceMatch &&
    (testText.includes("gratis") || testText.includes("free"))
  ) {
    return 0;
  }

  if (priceMatch && priceMatch.length >= 4) {
    const integers = Number(priceMatch[2]) * 100;
    let cents;
    if (!!priceMatch[3].includes("-")) {
      cents = 0;
    } else {
      cents = Number(priceMatch[3]);
    }

    return (integers + cents) / 100;
  }

  const onlyIntegers = testText.match(/\d{1,3}/);
  if (onlyIntegers && onlyIntegers.length) {
    return onlyIntegers[0];
  }

  if (contextText) {
    const searchresultInBroaderContext = getPriceFromHTML(contextText);
    if (searchresultInBroaderContext) {
      return searchresultInBroaderContext;
    }
  }

  return null;
}

export function log(message) {
  parentPort.postMessage({
    status: "console",
    message: message,
  });
}

export function basicMusicEventsFilter(musicEvent, index) {
  const t = musicEvent?.title ?? "";
  const st = musicEvent?.shortText ?? "";
  const searchShowNotOnDate = `${t.toLowerCase()} ${st.toLowerCase()}`;

  const mayNotContainTrue = [
    "uitgesteld",
    "sold out",
    "gecanceld",
    "uitverkocht",
    "afgelast",
    "geannuleerd",
    "verplaatst",
  ].map((forbiddenTerm) => {
    return searchShowNotOnDate.includes(forbiddenTerm);
  });

  return !mayNotContainTrue.includes(true);
}

export function postPageInfoProcessing(pageInfo = null) {
  const pageInfoCopy = { ...pageInfo };
  if (!pageInfo) return {};

  if (pageInfo.priceTextcontent || pageInfo.priceContexttext) {
    const context = pageInfo?.priceContexttext ?? null;
    pageInfoCopy.price = getPriceFromHTML(pageInfo.priceTextcontent, context);
  }

  pageInfoCopy.longText = saveLongTextHTML(pageInfo);
  return pageInfoCopy;
}

export function saveLongTextHTML(pageInfo) {
  if (!pageInfo.hasOwnProperty("longTextHTML") || !pageInfo.longTextHTML) {
    return null;
  }
  let uuid = crypto.randomUUID();
  const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

  fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => { });
  return longTextPath;
}

const def = {
  handleError,
  errorAfterSeconds,
  isRock
};

export default def;


export async function isRock(
  browser,
  eventTitles,
  isRockPossible = false,
  logCheck = false
) {

  if (logCheck) {
    log(`checking: ${eventTitles.join('; ')}`)
  }

  if (eventTitles.length) {
    return false;
  }

  const newTitles = [...eventTitles]
  const title = newTitles.shift();

  const page = await browser.newPage();

  await page.goto(
    new URL(`https://www.metal-archives.com/search?searchString=${title}&type=band_name`)
  );
  isRockPossible = isRockPossible || await page.evaluate(() => {
    const isEmptyEl = document.querySelector(".dataTables_empty");
    return !isEmptyEl;
  });

  if (!isRockPossible) {
    await page.goto(`https://en.wikipedia.org/wiki/${title.replace(/\s/g, '_')}`);
    isRockPossible = await page.evaluate(() => {
      const isRock = !!document.querySelector(".infobox a[href*='rock']");
      const isMetal = !!document.querySelector(".infobox a[href*='metal']");
      return isRock || isMetal;
    });
  }

  page.close();

  if (isRockPossible) {
    return true;
  }

  if (newTitles.length) {
    return await isRock(browser, newTitles, isRockPossible)
  } else {
    return false;
  }

}


export async function waitFor(wait = 500) {
  return new Promise((res, rej) => {
    setTimeout(res, wait);
  })
}
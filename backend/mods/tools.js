import { parentPort } from "worker_threads";
import fs from "fs";
import fsDirections from "./fs-directions.js";
import crypto from "crypto";
import fetch from 'node-fetch';
import { WorkerMessage } from "./rock-worker.js";

export function handleError(error, workerData) {
  parentPort.postMessage(WorkerMessage.quick("update", 'error', {
    content: {
      workerData: workerData,
      status: 'error',
      text: error.message
    },
  }));
  const time = new Date();
  const curErrorLog = fs.readFileSync(fsDirections.errorLog) || "";
  const newErrorLog = `
  ${workerData.name} Error - ${time.toLocaleTimeString()}
  ${error.stack} 
  ${error.message}
  
  ${curErrorLog}`;

  fs.writeFileSync(fsDirections.errorLog, newErrorLog, "utf-8");
}

export function failurePromiseAfter(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject({
        status: 'failure',
        data: null
      });
    }, time)
  })
}

export function getShellArguments() {
  const shellArguments = {};
  process.argv.forEach(function (val, index, array) {
    if (index < 2) {
      return;
    }
    if (!val.includes('=')) {
      throw new Error(`Invalid shell arguments passed to node. Please use foo=bar bat=gee.`)
    }
    const [argName, argValue] = val.split('=');
    shellArguments[argName] = argValue;
  });
  return shellArguments;
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

export function log(message, worker = null, workerName = null) {
  parentPort.postMessage({
    status: "console",
    message: message,
    workerName,
    worker,
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

  if (!eventTitles.length) {
    return false;
  }
  if (isRockPossible) {
    return true;
  }

  const newTitles = [...eventTitles]
  const title = newTitles.shift();

  const MetalEncFriendlyTitle = title.replace(/\s/g, '_');
  const foundInMetalEncyclopedia = await fetch(`https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${MetalEncFriendlyTitle}`)
    .then(result => result.json())
    .then(parsedJson => {
      return parsedJson.iTotalRecords > 0;
    })
  isRockPossible = isRockPossible || foundInMetalEncyclopedia

  let wikipediaSaysRock = false;
  if (!isRockPossible) {
    const page = await browser.newPage();
    await page.goto(`https://en.wikipedia.org/wiki/${title.replace(/\s/g, '_')}`);
    wikipediaSaysRock = await page.evaluate(() => {
      const isRock = !!document.querySelector(".infobox a[href*='rock']") && !document.querySelector(".infobox a[href*='Indie_rock']");
      const isMetal = !!document.querySelector(".infobox a[href*='metal']");
      return isRock || isMetal;
    });
    page.close();
  }

  isRockPossible = isRockPossible || wikipediaSaysRock


  if (logCheck) {
    log(`checking: ${eventTitles.join('; ')}, isRock: ${isRockPossible} MetalEnc: ${foundInMetalEncyclopedia} wiki: ${wikipediaSaysRock}`)
  }

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
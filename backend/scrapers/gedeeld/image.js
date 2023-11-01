/* global document */
import https from 'https';
import fs from 'fs';
// eslint-disable-next-line import/no-extraneous-dependencies
import sharp from 'sharp';
import fsDirections from '../../mods/fs-directions.js';
import { handleError } from '../../mods/tools.js';

function downloadImage(url, filepath, workerData) {
  return new Promise((resolve, reject) => {
    try {
      https.get(url, (res) => {
        if (res.statusCode === 200) {
          res
            .pipe(fs.createWriteStream(filepath))
            .on('error', reject)
            .once('close', () => resolve(filepath));
        } else if (`${res.statusCode}`[0] === '3') {
          resolve(`${fsDirections.publicLocationImages}/${workerData.family}-vol.webp`);
        } else {
          res.resume();
          reject(
            new Error(
              `Request Failed With a Status Code: ${res.statusCode} see <a href='vscode://vscode-remote/wsl+Ubuntu-22.04/home/sjerp/dev/apache/concertagenda/backend/temp/error.log:1:1'>the log</a>`,
            ),
          );
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
async function downloadImageCompress({
  _this,
  image,
  workerData,
  imagePath,
  familyOverSchrijving = '',
}) {
  let fam = '';
  if (familyOverSchrijving) {
    fam = familyOverSchrijving;
  } else {
    fam = workerData.family;
  }

  if (!fs.existsSync(`${_this.eventImagesFolder}/${fam}`)) {
    fs.mkdirSync(`${_this.eventImagesFolder}/${fam}`);
  }

  if (image.includes('event-images')) {
    return true;
  }

  const extMatch = image.match(/.jpg|.jpeg|.png|.webp/);
  const extension = Array.isArray(extMatch) ? extMatch[0] : 'onbekend';

  try {
    await downloadImage(image, `${imagePath}-ori${extension}`, workerData);
  } catch (error) {
    handleError(error, workerData, 'download image', 'notice', { image, imagePath });
    return false;
  }

  await sharp(`${imagePath}-ori${extension}`)
    .resize(440, 250)
    .webp()
    .toFile(`${imagePath}-w440.webp`, () => {});

  await sharp(`${imagePath}-ori${extension}`)
    .resize(750, 340)
    .webp()
    .toFile(`${imagePath}-w750.webp`, () => {});

  await sharp(`${imagePath}-ori${extension}`)
    .webp()
    .toFile(`${imagePath}-vol.webp`, () => {});

  return true;
}

export default async function getImage({
  _this,
  page,
  event,
  pageInfo,
  selectors,
  mode,
  workerData,
}) {
  const res = {
    errors: [],
  };

  try {
    await page.waitForSelector(selectors[0], {
      timeout: 2500,
    });
  } catch (error) {
    try {
      if (selectors.length > 1) {
        await page.waitForSelector(selectors[1], {
          timeout: 250,
        });
      } else {
        res.errors.push({
          error,
          remarks: `geen ${selectors[0]}`,
        });
        return res;
      }
    } catch (error2) {
      try {
        if (selectors.length > 2) {
          await page.waitForSelector(selectors[2], {
            timeout: 250,
          });
        } else {
          res.errors.push({
            error: error2,
            remarks: `geen ${selectors[0]} of ${selectors[1]}`,
          });
          return res;
        }
      } catch (error3) {
        res.errors.push({
          error: error3,
          remarks: `geen ${selectors[0]} of ${selectors[1]} of ${selectors[2]}`,
        });
        return res;
      }
    }
  }

  const pi = pageInfo?.anker ? pageInfo?.anker : event?.pageInfo;
  let image = null;
  const selectorsCopy = [...selectors];
  if (mode === 'image-src') {
    while (!image && selectorsCopy.length > 0) {
      const selector = selectorsCopy.shift();
      // eslint-disable-next-line no-await-in-loop
      image = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ selector }) => {
          const el = document.querySelector(selector);
          let src = null;
          if (!el?.src && el?.hasAttribute('data-src')) {
            src = el.getAttribute('data-src');
          } else if (!el?.src && el?.hasAttribute('srcset')) {
            src = el.getAttribute('srcset').split(/\s/)[0];
          } else {
            src = el?.src ?? null;
          }

          if (src && !src.includes('https')) {
            src = `${document.location.protocol}//${document.location.hostname}${src}`;
          }

          return src;
        },
        { selector },
      );
    }
  } else if (mode === 'background-src') {
    while (!image && selectorsCopy.length > 0) {
      const selector = selectorsCopy.shift();
      // eslint-disable-next-line no-await-in-loop
      image = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ selector }) => {
          const mmm =
            document
              .querySelector(selector)
              ?.style.backgroundImage.match(/https.*.jpg|https.*.jpeg|https.*.png|https.*.webp/) ??
            null;
          if (!Array.isArray(mmm)) return null;
          let src = mmm[0];
          if (!src.includes('https')) {
            src = `${document.location.protocol}//${document.location.hostname}${src}`;
          }
          return src;
        },
        { selector },
      );
    }
  } else if (mode === 'weird-attr') {
    while (!image && selectorsCopy.length > 0) {
      const selector = selectorsCopy.shift();
      // eslint-disable-next-line no-await-in-loop
      image = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ selector }) => {
          const el = document.querySelector(selector);
          let src = null;
          if (!el?.href && el?.hasAttribute('content')) {
            src = el.getAttribute('content');
          } else {
            src = el?.href ?? null;
          }

          if (!src.includes('https')) {
            src = `${document.location.protocol}//${document.location.hostname}${src}`;
          }

          return src;
        },
        { selector },
      );
    }
  }

  if (!image) {
    // res.errors.push({
    //   remarks: `image missing ${pi}`,
    // });
    _this.dirtyTalk(`Image missing ${pi}`);
    return res;
  }

  const base64String = Buffer.from(
    event.venueEventUrl.substring(
      event.venueEventUrl.length - 30,
      event.venueEventUrl.length,
    ),
  ).toString('base64');
  let imagePath = `${_this.eventImagesFolder}/${workerData.family}/${base64String}`;

  if (
    !workerData?.shellArguments?.keepImages ||
    workerData?.shellArguments?.keepImages === 'false'
  ) {
    if (fs.existsSync(`${imagePath}-vol.webp`)) {
      // niets doen!
    } else {
      const diCompressRes = await downloadImageCompress({
        image,
        imagePath,
        workerData,
        _this,
      });
      if (!diCompressRes) {
        res.errors.push({
          remarks: `download compress ${event.title} ${image} fail`,
        });
        imagePath = '';
      }
    }
  }

  res.image = imagePath;
  return res;
}

// #endregion                                                 IMAGE

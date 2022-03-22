export default async function radarScraper(browser, url) {
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "networkidle2",
  });

  let eventData = await page.evaluate((x) => {
    const rows = Array.from(document.querySelectorAll("tbody tr")).map(
      (row) => {
        const eventAnchor = row.querySelector("td a");
        let startDateTimeEl = row.querySelector(".date-display-start");
        const startDateTime =
          !!startDateTimeEl && startDateTimeEl.hasAttribute("content")
            ? startDateTimeEl.getAttribute("content")
            : null;
        let endDateTimeEl = row.querySelector(".date-display-end");
        const endDateTime =
          !!endDateTimeEl && endDateTimeEl.hasAttribute("content")
            ? endDateTimeEl.getAttribute("content")
            : null;
        return {
          startDateTime,
          endDateTime,
          title: eventAnchor.textContent,
        };
      }
    );
    return rows;
  }, null);
  page.close();
  return eventData;
}

import fs from "fs";

async function init() {
  const alleEvents = JSON.parse(
    fs.readFileSync("./event-lists/events-list.json")
  );
  console.log(`Er zijn nu ${alleEvents.length} events`);
}

(() => {
  init();
})();

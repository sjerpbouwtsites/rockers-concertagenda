import fs from 'fs';

const apiKey = getTicketMasterApiKey();

recursiveTickermasterFetch().then(() => {
  console.log('hoera')
})

function recursiveTickermasterFetch(page = 0, fileSystemPromises = []) {
  return fetch(`https://app.ticketmaster.com/discovery/v2/events.json?countryCode=NL&apikey=${apiKey}&size=199&page=${page}`).then(result => {
    return result.json()
  }).then(fetchedData => {
    fileSystemPromises.push(fs.writeFile(`./rawTicketmasterJSON/raw-${page}.json`, JSON.stringify(fetchedData), "UTF-8", () => { }))
    if (page < 5) {
      return waitFor(50).then(() => {
        return recursiveTickermasterFetch(page + 1, fileSystemPromises)
      })
    } else {
      console.log('voorbij page 5')
    }
    return Promise.all(fileSystemPromises);
  }).catch(fail => {
    console.log(fail)
  })
}

function getTicketMasterApiKey() {
  const envData = fs.readFileSync('../.env', 'UTF-8');
  let r
  envData.split(`\n`).forEach(row => {
    if (row.includes('ticketmaster_consumer_key')) {
      r = row.replace('ticketmaster_consumer_key=', '')
    }
  })
  return r;
}

async function waitFor(wait = 500) {
  return new Promise((res, rej) => {
    setTimeout(res, wait);
  })
}
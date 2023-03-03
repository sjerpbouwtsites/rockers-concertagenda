fetch('https://www.ticketmaster.nl/event/285863?brand=nl_p60').then(function (response) {
  // The API call was successful!
  return response.text();
}).then(function (htmlBlob) {
  // This is the HTML from our response as a text string
	
  document.getElementById('print-fetch').innerHTML = htmlBlob
  console.log(document.querySelector('#main-content').textContent.match(/\d\d.\d\d/))
}).catch(function (err) {
  // There was an error
  console.warn('Something went wrong.', err);
});

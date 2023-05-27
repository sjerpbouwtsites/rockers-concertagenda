const metalEncUrl = `https://www.metal-archives.com/search/ajax-band-search/?field=name&query=ghost`;
const foundInMetalEncyclopedia = await fetch(metalEncUrl)
  .then((result) => result.json())
  .then((parsedJson) => {
    if (parsedJson.iTotalRecords < 1) return false
    const bandNamesAreMainTitle = parsedJson.aaData.some(bandData => {
      let match;
      try {
        match = bandData[0].match(/>(.*)<\//);
        if (Array.isArray(match) && match.length > 1){
          return match[1].toLowerCase() === 'ghost';
        } 
      } catch (error) {
        return false
      }
      return false;
    });
    return bandNamesAreMainTitle
  });
console.log(foundInMetalEncyclopedia)
// if (foundInMetalEncyclopedia) {
//   return {
//     event,
//     success: true,
//     reason: `found in <a class='single-event-check-reason metal-encyclopedie metal-encyclopedie--success' href='${metalEncUrl}'>metal encyclopedia</a>`
//   };
// }
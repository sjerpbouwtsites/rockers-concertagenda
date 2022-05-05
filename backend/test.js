import fetch from 'node-fetch';

const foundInMetalEncyclopedia = await fetch(`https://www.metal-archives.com/search/ajax-band-search/?field=name&query=Queen_Latifa`)
  .then(result => result.json())
  .then(parsedJson => {
    console.log(parsedJson.iTotalRecords > 0)
    return parsedJson.iTotalRecords > 0;
  })


console.log(foundInMetalEncyclopedia)

export default function verwerkLongHTML(HTMLstring){

  let htmlKopie = HTMLstring + '';

  const htmlKopie2 = verwijderFouteTagsEnAttributes(htmlKopie);

  const [htmlZonderSoc, socLinks] = filterSocialeMedia(htmlKopie2);
  const [htmlZonderIframes, iframeArr] = filterVideosMuziek(htmlZonderSoc);
  
  const socHTML = socLinks.length
    ? `<nav class="long-html__social">
    <h3 class='long-html__social-title'>sociale media uit dit event:</h3>
    <ul class='long-html__social-list'>
      ${socLinks.map((fbLink) => `<li class='long-html__social-list-item'>${fbLink}</li>`).join(`\n`)}
    </ul>
  </nav>`
    :''

  const muziekVideosHTML = iframeArr.length 
    ? `
    <figure class='long-html__music-videos'>
      ${iframeArr.join(`\n`)}
    </figure>
  ` :'';

  return `${htmlZonderIframes}${muziekVideosHTML}${socHTML}`
}

function filterSocialeMedia(htmlString){
  let htmlKopie = htmlString + '';
  const fbMatch1 = htmlString.match(/(<a\s?.*href=\".*facebook\.com.*<\/a>)/gmi);
  const facebookLinks1 = Array.isArray(fbMatch1) ? fbMatch1 : []
  facebookLinks1.forEach(link => {
    htmlKopie = htmlKopie.replace(link,'');  
  })
  
  const fbMatch2 = htmlString.match(/(<a\s?.*href=\".*fb\.me.*<\/a>)/gmi);
  const facebookLinks2 = Array.isArray(fbMatch2) ? fbMatch2: [];
  facebookLinks2.forEach(link => {
    htmlKopie = htmlKopie.replace(link,'');  
  })

  const instaMatch1 = htmlString.match(/(<a.*href=\"https:\/\/www\.instagram\.com.*<\/a>)/gmi);
  const instaLinks1 = Array.isArray(instaMatch1) ? instaMatch1 : []
  instaLinks1.forEach(link => {
    htmlKopie = htmlKopie.replace(link,'');
  })

  const bandcampMatch = htmlString.match(/(<a.*href=\"https:\/\/.*\.bandcamp\.com.*<\/a>)/gmi);
  const bandcampLinks1 = Array.isArray(bandcampMatch) ? bandcampMatch : []; 
  bandcampLinks1.forEach(link => {
    htmlKopie = htmlKopie.replace(link,'');
  })

  htmlKopie = tweedeBatchVerwijderen(htmlKopie)

  const socLinks = [...facebookLinks1, ...facebookLinks2, ...instaLinks1, ...bandcampLinks1];
  return [htmlKopie, socLinks];
}

function filterVideosMuziek(htmlString){

  let htmlKopie = htmlString + ''
  const iframeMatch = htmlString.match(/(?:<iframe[^>]*)(?:(?:\/>)|(?:>.*?<\/iframe>))/gmi);
  let iframeArr = Array.isArray(iframeMatch) ? iframeMatch : [];
  iframeArr.forEach(link => {
    htmlKopie = htmlKopie.replace(link,'');
  })

  if (iframeArr.length === 0){
    iframeArr = HTMLnaarYoutubeIframes(htmlString);
  }

  return [htmlKopie, iframeArr];
}

function HTMLnaarYoutubeIframes(html) {
  
  const eersteMatch = html.match(/(youtu\.be|youtube\.com\/embed\/\w+|youtube\.com\/vi)/g)
  const youtubeIds = Array.isArray(eersteMatch) 
    ? eersteMatch.map(matchStr => matchStr.match(/\w+$/)).flat()
    : [];
  const uniekeYoutubeIds = []
  youtubeIds.forEach(id => {
    if(!uniekeYoutubeIds.includes(id)){
      uniekeYoutubeIds.push(id)
    }
  })
  return uniekeYoutubeIds.map(id => {
    return `<iframe width="380" height="214" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`
  })
}
  
function verwijderAlleElementenVan(string, openTag, dichtTag){
  
  var openIndices = getAllIndexes(string, openTag);
  var sluitIndices = getAllIndexes(string, dichtTag);
  
  for (let i = openIndices.length -1; i >= 0; i-- ){
    let huidigeSluitIndex = sluitIndices[i]
    let huidigeOpenIndex = openIndices[i]
    let teVervangenSubstring = string.substring(huidigeOpenIndex, huidigeSluitIndex + dichtTag.length)
    string = string.replace(teVervangenSubstring,'')
  
  }
  return string;
}
function getAllIndexes(arr, val) {
  var indexes = [], i = -1;
  while ((i = arr.indexOf(val, i+1)) != -1){
    indexes.push(i);
  }
  return indexes;
}

function verwijderFouteTagsEnAttributes(htmlString){

  let workingString = verwijderAlleElementenVan(htmlString, '<style', '</style>')
  workingString = verwijderAlleElementenVan(workingString, '<script', '</script>')
  workingString = verwijderAlleElementenVan(workingString, '<button', '</button>')
  workingString = verwijderAlleElementenVan(workingString, '<svg', '</svg>')

  let gereplaced = workingString
    .replaceAll(/class="([^"]*)"/g,' ')
    .replaceAll(/class='([^"]*)'/g,' ')
    .replaceAll(/style="([^"]*)"/g,' ')
    .replaceAll(/style='([^"]*)'/g,' ')
    .replaceAll(/<\!--.*-->/g,'')
    .replaceAll(/\s{2,200}/g,' ')
    .replaceAll(/\s+>/g,'>')

  return gereplaced   
}

function tweedeBatchVerwijderen(htmlString){
  let workingString = verwijderAlleElementenVan(htmlString, '<meta', '</meta>')
  workingString = workingString.replaceAll(/(\<div.*?\>|\<\/div.*?\>)/g,'')
  return workingString;
}
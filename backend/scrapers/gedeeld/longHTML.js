export default function verwerkLongHTML(HTMLstring){

  let htmlKopie = HTMLstring + '';

  const htmlKopie2 = verwijderFouteTagsEnAttributes(htmlKopie);

  const [htmlZonderSoc] = filterSocialeMedia(htmlKopie2);
  const [htmlZonderIframes, iframeArr] = filterVideosMuziek(htmlZonderSoc);
  
  const socHTML = `<!--socials moeten toch apart-->`;
  // const socHTML = socLinks.length
  //   ? `<nav class="long-html__social">
  //   <ul class='long-html__social-list'>
  //     ${socLinks.map((fbLink) => `<li class='long-html__social-list-item'>${fbLink}</li>`).join(`\n`)}
  //   </ul>
  // </nav>`
  //   :''

  const muziekVideosHTML = iframeArr.length 
    ? `
    <section class='long-html__music-videos'>
      ${iframeArr.join(`\n`)}
    </section>
  ` :'';

  return `${htmlZonderIframes}${socHTML}${muziekVideosHTML}`
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

  const socLinks = [...facebookLinks1, ...facebookLinks2, ...instaLinks1, ...bandcampLinks1]
    .map(socLinkEl => {
      const hrefMatch = socLinkEl.match(/\/\/.[^"]*/);
      if (!Array.isArray(hrefMatch)) return;
      let textContent = socLinkEl.replace(/(<([^>]+)>)/gi, '');
      const href = hrefMatch[0];
      if (textContent.includes("bandcamp.com")){
        textContent = textContent.replace('.bandcamp.com','').replace('https://','').replace('www.','')
        textContent = "Bandcamp " + textContent;
      } else if (href.includes('bandcamp') && !textContent.toLowerCase().includes('bandcamp')){
        textContent = `Bandcamp ${textContent}`;
      }
      return `<a class='long-html__social-list-link' href='${href}'>${textContent}</a>`;
    });

  return [htmlKopie, socLinks];
}

function filterVideosMuziek(htmlString){

  let htmlKopie = htmlString + ''
  const iframeMatch = htmlString.match(/(?:<iframe[^>]*)(?:(?:\/>)|(?:>.*?<\/iframe>))/gmi);
  let iframeArr = Array.isArray(iframeMatch) 
    ? iframeMatch
    : [];
  iframeArr.forEach(link => {
    htmlKopie = htmlKopie.replace(link,'');
  })
  iframeArr = iframeArr.map(ifm => {
    const className = ifm.includes('youtu') ? '16-9' : '152px';
    return `<div class="iframe-wrapper-${className}">${ifm}</div>`
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
    return `<div class='iframe-wrapper-16-9'>
      <iframe width="380" data-zelfgebouwd height="214" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>
    </div>`
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


function youtubeSRCToIframe(src){
  return `<iframe width="380" data-zelfgebouwd height="214" src="${src}" frameborder="0" allowfullscreen></iframe>`
}

function youtubeIDToIframe(id){
  return `<iframe width="380" data-zelfgebouwd height="214" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`
}

export function makeLongHTMLNewStyle(event){
  
  if (!event.textForHTML) event.textForHTML = '';
  if (!event.mediaForHTML) event.mediaForHTML = []
  if (!event.socialsForHTML) event.socialsForHTML = []
  const mediaHTML = event.mediaForHTML
    .map(bron => {
      if (bron.outer && bron.type === 'youtube'){
        return `<div class='iframe-wrapper-16-9'>${bron.outer}</div>`
      }
      if (bron.outer && bron.type === 'spotify'){
        return `<div class='iframe-wrapper-152px'>${bron.outer}</div>`
      }      
      if (bron.outer){
        return `<div class='iframe-wrapper-generiek'>${bron.outer}</div>`
      }      
      if (bron.src && bron.type === 'youtube'){
        return `<div class='iframe-wrapper-16-9'>${youtubeSRCToIframe(bron.src)}</div>`;
      }
      if (bron.id && bron.type === 'youtube'){
        return `<div class='iframe-wrapper-16-9'>${youtubeIDToIframe(bron.id)}</div>`;
      }      
      if (bron.src && bron.type !== 'youtube'){
        return `onbekende type ${bron.type}`
      }
      return JSON.stringify(bron)
    })
    .join(``)

  const mediaSection = mediaHTML 
    ? `<section class='long-html__music-videos'>${mediaHTML}</section>`
    :''
  const socialsHTML = event.socialsForHTML.map(socialHTML =>{
    return `<li class='long-html__social-list-item'>${socialHTML}</li>`;
  }).join('');
  const socialsSection = socialsHTML.length 
    ? `<nav class="long-html__social">
    <ul class='long-html__social-list'>
      ${socialsHTML}
    </ul>
  </nav>`
    :'';

  // headings omlaag gooien.
  const thtml = event.textForHTML
    .replaceAll('h6', 'strong')
    .replaceAll('h5', 'strong')
    .replaceAll('h4', 'strong')
    .replaceAll('h3', 'h4')
    .replaceAll('h1', 'h2')
    .replaceAll('h2', 'h3')

  const reshtml = `
    <div class='long-html'>
    <section class='long-html__text'>
    ${thtml}
    </section>
    ${mediaSection}
    ${socialsSection}
    </div>
  `

  return reshtml;
  
}
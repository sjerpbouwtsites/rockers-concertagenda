const dagMaandAlsWoordJaar = /(\d+)\s(\w+)\s(\d\d\d\d)/
const urenMinuten = /\d\d\s?:\s?\d\d/
const backgroundImageSrc = /https.*.jpg|https.*.jpeg|https.*.png|https.*.webp/
const regexes = {
  dagMaandAlsWoordJaar,
  backgroundImageSrc,
  urenMinuten
};
export default regexes;
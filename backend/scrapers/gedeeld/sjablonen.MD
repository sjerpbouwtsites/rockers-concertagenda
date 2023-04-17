# Sjablonen!

## res obj

### Res obj in makeBaseEventList
```js
const title = doc.balblabl.textContent.etc;
const res = {
  unavailable: '',
  pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
  errors: [],
  title
};
```

### Res obj in getPageInfo
```js
  // event via params
  const res = {
    unavailable: event.unavailable,
    pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
    errors: [],
  };
```

## image error
```js
  if (!res.image){
    res.errors.push({
      remarks: `image missing ${res.pageInfo}`
    })
  }
```

## scraperConfig basic
```js
new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    app: {
      mainPage: {
        url: "",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));
```
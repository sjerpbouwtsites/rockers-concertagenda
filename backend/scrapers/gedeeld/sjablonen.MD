# Sjablonen!

## res obj

### Res obj in mainPage
```js
const title = doc.balblabl.textContent.etc;
const res = {
  pageInfo: `<a href='${location.href}'>${workerData.family} main - ${title}</a>`,
  errors: [],
  title
};
```

### Res obj in singlePage
```js
  // event via params
  const res = {
    pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
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
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
```
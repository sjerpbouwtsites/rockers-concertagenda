# Sjablonen!

## res obj

### Res obj in mainPage

```js
const title = doc.balblabl.textContent.etc;
const res = {
  anker: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
  errors: [],
  title,
};
```

### Res obj in singlePage

```js
// event via params
const res = {
  anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
  errors: [],
};
```

## image error

```js
if (!res.image) {
  res.errors.push({
    error: new Error(`image missing ${res.anker}`),
  });
}
```

## scraperConfig basic

```js
new AbstractScraper({
  workerData: Object.assign({}, workerData),

    app: {
      mainPage: {
        url: "",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }

}));
```

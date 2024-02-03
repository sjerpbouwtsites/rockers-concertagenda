# Datastructuur JSONs in store

## Waarom zulke platte objecten met weinig keys
Omdat er te veel data in het spel is.
De bestanden werden te groot. Dus ik kies voor kleiner formaat èn snelheid bij opvragen.
Arrays die je opzoekt met slechts één key, geen verder gezoek.
O en het is ter voorbereiding van een gang naar een relationele database.

### store/allowed-events.json

Een row bevat als key de lowercase getrimde event title, als het geen slug is.
Als het een slug is, is de slug de key.
uniqueKeys mogen maar één keer voorkomen en hebben een minimumlengte van 10. Indien de key (titel/slug) niet lang genoeg is wordt de eventDate erachter geplakt.

uniqueKey: string
isSlug: integer 0 of 1
eventDate: kort, YYMMDD, dus bijvoorbeeld 230822 = 2023 augustus 22. Facultatief.
creationShortDate: kort, YYMMDD, dus bijvoorbeeld 230822 = 2023 augustus 22. Verplicht.

```js
{
    uniqueKey: [isSlug, eventDate, creationDate],
    uniqueKey: [isSlug, eventDate, creationDate],
}
```

### store/refused-events.json

refused-events.json bevat zowel afgewezen artiesten als afgewezen events. 
Het verschil hiertussen valt ook niet persé te maken, bijvoorbeeld als niets gevonden is.

uniqueKey: string,
isSlug: integer 0 of 1
spotifyId: mixed string zoals 6W7sLPSUQc6SZ9ZUJN2lzn
metalEncycloBandnaamEnCountries: encodeURI(BANDNAAM) & evt. &%C%[]=LANDCODE
eventDate: kort, YYMMDD, dus bijvoorbeeld 230822 = 2023 augustus 22. Facultatief.
creationShortDate: kort, YYMMDD, dus bijvoorbeeld 230822 = 2023 augustus 22. Verplicht.
Verder wordt er van uit gegaan dat een band of artiest nooit meer dan 30 tekens in zijn naam heeft. Als er meer dan 30 tekens zijn wordt spotify en metalEncyclo overgeslagen.
inMetalEncyclo staat &%C%[] voor &country[]=. Scheelt data

```js
{
    uniqueKey: [isSlug, spotifyId, metalEncycloBandnaamEnCountries, eventDate, creationDate],
    uniqueKey: [isSlug, spotifyId, metalEncycloBandnaamEnCountries, eventDate, creationDate],
}

```

### store/allowed-artists.json

allowed-artists.json bevat alleen artiesten. Event titles komen hier niet. Er wordt slechts
naar geschreven als uit een extern controle blijkt dat [string] een rockartiest is.

uniqueKey: string,
isSlug: integer 0 of 1
spotifyId: mixed string zoals 6W7sLPSUQc6SZ9ZUJN2lzn
metalEncycloBandnaamEnCountries: encodeURI(BANDNAAM) & evt. &%C%[]=LANDCODE
genres: [string] verzameling genrenamen.
eventDate: kort, YYMMDD, dus bijvoorbeeld 230822 = 2023 augustus 22. Facultatief.
creationShortDate: kort, YYMMDD, dus bijvoorbeeld 230822 = 2023 augustus 22. Verplicht.

bij artiestnamen is er opnieuw een minimumlengte. Die is hier 4. Onder die lengte komen de strings 
te snel overeen en krijg je te veel valse positieven. Dit betekent niet dat artiesten als 'ben' uitgesloten 
worden; hun events kunnen ook op andere wijze nog in de app komen.
inMetalEncyclo staat &%C%[] voor &country[]=. Scheelt data

```js
{
    uniqueKey: [isSlug, spotifyId, metalEncycloBandnaamEnCountries, genres, eventDate, creationDate],
    uniqueKey: [isSlug, spotifyId, metalEncycloBandnaamEnCountries, genres, eventDate, creationDate],
}

```

## van Ids naar zoekopdracht spotify en metalencyclopedia

### metal encyclo
metal-encyclopedia links vallen uiteen in minstens:
basis: https://www.metal-archives.com/search/ajax-advanced/searching/bands/?bandName=
${urlencoded bandname}&yearCreationFrom=&yearCreationTo=&status[]=1
en dan kan je per land mogelijk zoeken: country[]=NL
Dus dat zijn hooguit twee datapunten: urlencoded bandname en countries. En aangezien het allemaal
GET is kan je dat achter elkaar zetten: metalEncycloBandnaamEnCountries
Als er een artiest gevonden is op spotify of metalEncyclopedie, dan is er data. Anders niet.
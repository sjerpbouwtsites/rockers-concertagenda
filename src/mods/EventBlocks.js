import React from "react";
import { BEMify, filterEventsDateInPast } from "./util.js";


class EventBlocks extends React.Component {

  //#region constructor en life cycle

  constructor(props) {
    super(props);
    this.state = {
      musicEvents: [],
      maxEventsShown: 250,
      eventDataLoading: false,
      eventDataLoaded: false,
    };
    this.currentYear = new Date().getFullYear();
    this.createLocation = this.createLocation.bind(this);
    this.createDates = this.createDates.bind(this);
    this.add100ToMaxEventsShown = this.add100ToMaxEventsShown.bind(this);
  }

  componentDidUpdate() {
    if (!this.state.eventDataLoaded && !this.state.eventDataLoading) {
      this.getEventData();
    }
  }

  //#endregion constructor en life cycle

  //#region fetch methoden getEventData en loadLongerText
  async getEventData() {
    this.setState({ eventDataLoading: true });
    return await fetch("./events-list.json", {})
      .then((response) => {
        return response.json();
      })
      .then((musicEvents) => {
        let me2 = musicEvents
          .map(frontendMusicEventExpansionMap)
          .filter(filterEventsDateInPast);
        this.setState({ musicEvents: me2 });
        this.setState({ eventDataLoaded: true });
      })
      .catch((error) => {
        console.error(error);
        this.setState({ eventDataLoaded: false });
      })
      .finally(() => {
        this.setState({ eventDataLoading: false });
      });
  }

  async loadLongerText(musicEventKey) {
    
    const thisEvent = this.state.musicEvents[musicEventKey];
    if (!thisEvent.longText) {
      return;
    }

    await fetch(thisEvent.longText.replace("../public/", "/"), {})
      .then((response) => response.text())
      .then((text) => {
        console.log(text)
        let oldEvents = this.state.musicEvents;
        oldEvents[musicEventKey].shortText = null;
        oldEvents[musicEventKey].enlarged = true;
        oldEvents[musicEventKey].longTextHTML = text;
        this.setState({ musicEvents: [...oldEvents] });
        setTimeout(() => {
          const blockEl = document.getElementById(`event-id-${musicEventKey}`);
          const appBannerHeight =
            document.getElementById("app-banner").clientHeight;
          window.scrollTo(0, blockEl.offsetTop + appBannerHeight);
        }, 360);
      })
      .catch((err) => {
        console.warn('ERROR RETRIEVING LONG HTML FOR EVENT')
        console.error(err)
      });
  }  

  //#endregion fetch methoden getEventData en loadLongerText

  //#region event-block HTML methods

  priceElement(musicEvent) {
    const price = 
    musicEvent.soldOut ? 'Uitverkocht!' : 
      musicEvent?.price 
        ? `€ ${Number(musicEvent?.price)
          .toFixed(2)
          .toString()
          .replace(".", ",")}`
        : musicEvent?.origin === 'ticketmaster' 
          ? `€?`
          : 'Gratis'

    const sharedModifiers = [
      musicEvent.soldOut ? "sold-out" : "",
      musicEvent.enlarged ? "enlarged" : "",
    ];
    
    const priceSelectors = BEMify(`event-block__price anthracite-color`, sharedModifiers)    

    const emoji = musicEvent.soldOut ? `💀` : `🎫`
    const linkPriceWrapper = <a
      className={BEMify(`event-block__venue-link event-block__price-link-wrapper`, sharedModifiers)}
      href={musicEvent.venueEventUrl}
      target="_blank"
    ><span className='ticketemoji contrast-with-dark'>{emoji}</span><span className={priceSelectors}>
        {price}
      </span></a>

    return linkPriceWrapper
  }
   
  createDates(musicEvent) {
    
    const StartDateTime = new Date(musicEvent.startDateTime);
    const enlargedBEM = musicEvent.enlarged ? 'event-block__dates--enlarged' : '';
    const startDateText = StartDateTime.toLocaleDateString("nl", {
      weekday: musicEvent.enlarged ? "short" : undefined,
      month: musicEvent.enlarged ? 'long' : '2-digit',
      day: "numeric",
      year: musicEvent.enlarged 
        ? (StartDateTime.getFullYear() === this.currentYear ? "numeric" : undefined)
        : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
    const startDateHTML = <time className={`event-block__dates event-block__dates--start-date ${enlargedBEM}`} dateTime={musicEvent.startDateTime}>{startDateText}</time>;
    if (!musicEvent.enlarged){
      return startDateHTML;
    }

    let openDoorDateHTML = '';
    if (musicEvent.doorOpenDateTime) {
      const doorOpenDateTimeText = (new Date(musicEvent.doorOpenDateTime)).toLocaleDateString("nl", {
        hour: "2-digit",
        minute: "2-digit",
      });      
      openDoorDateHTML = <time className={`event-block__dates event-block__dates--door-date ${enlargedBEM}`} dateTime={musicEvent.doorOpenDateTime}>{doorOpenDateTimeText}</time>;
    }

    let endDateHTML = '';
    if (musicEvent.endDateTime) {
      const endDateTimeText = (new Date(musicEvent.doorOpenDateTime)).toLocaleDateString("nl", {
        hour: "2-digit",
        minute: "2-digit",
      });      
      endDateHTML = <time className={`event-block__dates event-block__dates--end-date ${enlargedBEM}`} dateTime={musicEvent.endDateTime}>{endDateTimeText}</time>;
    }

    return startDateHTML + openDoorDateHTML + endDateHTML;
    
  }

  createImageHTML(musicEvent, selectors) {
    const imgSrc =
      musicEvent.image ?? `location-images/${musicEvent.location}.jpg`;
    return imgSrc ? (
      <img
        className={selectors.image}
        src={imgSrc}
        alt={musicEvent.title}
        loading="lazy"
      />
    ) : (
      ""
    );
  }


  createLocation(musicEvent) {
    const locationObj = this.props.locations[musicEvent.location] ?? null;
    if (!locationObj) {
      return musicEvent.location;
    }
    return (<span>
      <span className='event-block__location-row'>{locationObj.name}</span><span className='event-block__location-row'>{locationObj.city}</span>
    </span>) ;
  }

  createShortTextHTML(musicEvent, selectors){
    if (!musicEvent.shortText) return '';
    return musicEvent.shortText ? 
      <p className={`${selectors.headerShortText}`}>
        {musicEvent.shortText}
      </p> : '';    
  }

  createShortestText(musicEvent){
    if (!musicEvent.shortText) return '';
    const m = 15;
    const splitted = musicEvent.shortText?.split(' ') ?? null;
    let s = musicEvent.shortText?.split(' ').splice(0, m).join(' ') ?? '';
    if (splitted.length > m){
      s += '...'
    }
    return s;
  }

  getSelectors(musicEvent, sharedModifiers){
    return {
      article: `
provide-dark-contrast
${BEMify(`event-block`, [
    musicEvent.location, 
    musicEvent.enlarged ? 'enlarged' : '',
    musicEvent.soldOut ? "sold-out" : '',
    musicEvent.firstOfMonth ? 'first-of-month' : '',
    musicEvent.soldOut ? 'sold-out' : '' 
  ])}`,
      header: `${BEMify(`event-block__header contrast-with-dark`, sharedModifiers)}`,
      headerH2: `${BEMify(`contrast-with-dark event-block__title`, sharedModifiers)}`,
      headerEventTitle: `${BEMify(`event-block__title-showname cursive-font`, sharedModifiers)}`,
      headerLocation: `${BEMify(`event-block__title-location color-green green-color event-block__header-text cursive-font`, sharedModifiers)}`,
      image: BEMify('event-block__image', sharedModifiers),
      dates: `${BEMify(`event-block__dates event-block__header-text contrast-with-dark`, sharedModifiers)}`,
      headerShortText: `${BEMify(`event-block__paragraph event-block__header-text contrast-with-dark`, ['short-text', ...sharedModifiers])} `,
      main: `${BEMify(`event-block__main contrast-with-dark`, sharedModifiers)}`,
      mainContainerForEnlarged: BEMify(`void-container-for-enlarged`, sharedModifiers),
      footer: `${BEMify(`event-block__footer`, sharedModifiers)} `,
    }    
  }

  //#endregion event-block HTML methods

  add100ToMaxEventsShown() {
    const oldMax = this.state.maxEventsShown;
    const posMax = oldMax + 100;
    const newMax = Math.min(posMax, this.state.musicEvents.length);
    this.setState({
      maxEventsShown: newMax,
    });
  }

  musicEventFilters(musicEvents) {
    const filtered = musicEvents
      .filter((musicEvent, musicEventKey) => {
        return musicEventKey <= this.state.maxEventsShown;
      })
      .filter((musicEvent) => {
        if (!this.props.filterSettings?.podia[musicEvent.location]) {
          return true;
        }
        return (
          this.props.filterSettings.podia[musicEvent.location].checked ?? true
        );
      })
      .filter((musicEvent) => {
        if (!this.props.filterSettings?.daterange?.lower) {
          return true;
        }
        const lowerRangeTime = new Date(
          this.props.filterSettings.daterange.lower
        ).getTime();
        const upperRangeTime = new Date(
          this.props.filterSettings.daterange.upper
        ).getTime();
        const eventTime = new Date(musicEvent.startDateTime).getTime();

        if (lowerRangeTime > eventTime) {
          return false;
        }
        if (upperRangeTime < eventTime) {
          return false;
        }
        return true;
      });

    return filtered.map((musicEvent, musicEventIndex) => {
      musicEvent.firstOfMonth = false;
      const startDateTime = new Date(musicEvent.startDateTime);
      musicEvent.eventMonth = startDateTime.toLocaleDateString("nl", {
        year: "numeric",
        month: "short",
      });
      if (!musicEventIndex || !filtered[musicEventIndex - 1]) {
        musicEvent.firstOfMonth = true;
      }
      if (musicEvent.eventMonth !== filtered[musicEventIndex - 1]?.eventMonth) {
        musicEvent.firstOfMonth = true;
      }
      return musicEvent;
    });
  }

  render() {
    const musicEvents = this.musicEventFilters(this.state.musicEvents);

    return (
      <div className={`event-block__wrapper`}>

        {musicEvents.map((musicEvent, musicEventKey) => {
          const sharedModifiers = [musicEvent.location, musicEvent.soldOut ? 'sold-out' : '', musicEvent.enlarged ? 'enlarged': ''];
          const selectors = this.getSelectors(musicEvent,sharedModifiers);
          const priceElement = this.priceElement(musicEvent);
          const datesHTML = this.createDates(musicEvent);
          const imageHTML = this.createImageHTML(musicEvent,selectors);
          const articleID = `event-id-${musicEventKey}`;
          const firstOfMonthBlock = musicEvent.firstOfMonth ? (
            <time className="event-block__first-of-month-time">
              {musicEvent.eventMonth}
            </time>
          ) : (
            ""
          );
          

          const shortTextHTML = this.createShortTextHTML(musicEvent, selectors);
          let shortestText = this.createShortestText(musicEvent);

          const titleIsCapsArr = musicEvent.title
            .split('')
            .map(char => char === char.toUpperCase());
          const noOfCapsInTitle = titleIsCapsArr.filter(a => a).length;
          const toManyCapsInTitle = ((musicEvent.title.length - noOfCapsInTitle) / musicEvent.title.length) < .5;
          if (toManyCapsInTitle){
            musicEvent.title = musicEvent.title.substring(0,1).toUpperCase()+musicEvent.title.substring(1,500).toLowerCase()
          }



          if (musicEvent.title.length > 45){
            const splittingCandidates = ['+', '&', ':', '>', '•'];
            let i = 0;
            do {
              const splitted = musicEvent.title.split(splittingCandidates[i]);
              musicEvent.title = splitted[0];
              const titleRest = splitted.splice(1, 50).join(' ');
              shortestText = titleRest + ' ' + shortestText;              
              i = i + 1;
            } while (musicEvent.title.length > 45 && i < splittingCandidates.length);
            shortestText = shortestText.substring(0,1).toUpperCase() + shortestText.substring(1,500).toLowerCase()
          }

          if (musicEvent.title.length > 45){
            musicEvent.title = musicEvent.title.replace(/\(.*\)/,'').replace(/\s{2,25}/,' ');
          }


          return (
            <article
              id={articleID}
              key={musicEventKey}
              data-date={musicEvent.eventMonth}
              onClick={this.loadLongerText.bind(this, musicEventKey)}
              className={selectors.article}
            >
              {firstOfMonthBlock}
              {imageHTML}
              <header className={selectors.header}>
                <h2 className={selectors.headerH2}>
                  <span className={selectors.headerEventTitle} data-short-text={shortestText}>
                    {musicEvent.title}
                  </span>
                  <span className={selectors.headerLocation}>
                    {this.createLocation(musicEvent)}
                    {!musicEvent.enlarged ? datesHTML : ''}
                  </span>
                </h2>
                {()=>{
                  return musicEvent.enlarged 
                    ? <span className={selectors.dates}>
                      {datesHTML}
                    </span>
                    : ''
                }}
                
                
              </header>
              <section className={selectors.main}>
                {musicEvent.enlarged ? shortTextHTML : ''}
                <div
                  className={selectors.mainContainerForEnlarged}
                  dangerouslySetInnerHTML={{
                    __html: musicEvent.longTextHTML,
                  }}
                ></div>
                <footer className={selectors.footer}>
                  {priceElement}  
                </footer>
              </section>
            </article>
          );
        }) // article mapper
        }
        <button
          className="event-block__more-blocks"
          onClick={this.add100ToMaxEventsShown}
        >
          <span>
            {this.state.maxEventsShown} van {this.state.musicEvents.length}{" "}
            geladen. Klik voor meer.
          </span>
        </button>
      </div>
    );
  }
}



function frontendMusicEventExpansionMap(musicEvent) {
  return {
    ...musicEvent,
    longTextHTML: null,
    enlarged: false,
  };
}



export default EventBlocks;

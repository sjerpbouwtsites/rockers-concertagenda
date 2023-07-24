import React from "react";
import { BEMify, filterEventsDateInPast } from "./util.js";
import closeIcon from '../images/close.png';
import LoadmoreButton from "./LoadmoreButton.js";

class EventBlocks extends React.Component {

  //#region constructor en life cycle

  constructor(props) {
    super(props);
    this.state = {
      musicEvents: [],
      maxEventsShown: 100,
      eventDataLoading: false,
      eventDataLoaded: false,
    };
    this.currentYear = new Date().getFullYear();
    this.createLocation = this.createLocation.bind(this);
    this.createDates = this.createDates.bind(this);
    this.add100ToMaxEventsShown = this.add100ToMaxEventsShown.bind(this);
    this.escFunction = this.escFunction.bind(this);
    this.gescrolledBuitenBeeldEnlarged = this.gescrolledBuitenBeeldEnlarged.bind(this);
  }

 
  componentDidUpdate() {
    if (!this.state.eventDataLoaded && !this.state.eventDataLoading) {
      this.getEventData();
    }
    this.sluitEnlarged = this.sluitEnlarged.bind(this);
  }

  componentDidMount(){
    document.addEventListener("keydown", this.escFunction, false);
  }
  componentWillUnmount(){
    document.removeEventListener("keydown", this.escFunction, false);
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
        document.querySelectorAll('.app-title__events-count').forEach(countEl=>{
          countEl.innerHTML = ` - ${musicEvents.length} concerten`;
        })
      })
      .catch((error) => {
        console.error(error);
        this.setState({ eventDataLoaded: false });
      })
      .finally(() => {
        this.setState({ eventDataLoading: false });
      });
  }
  async waitFor(wait = 500) {
    return new Promise((res) => {
      setTimeout(res, wait);
    });
  }

  escFunction(event){
    if (event.key === "Escape") {
      this.sluitEnlarged()
    }
  }

  gescrolledBuitenBeeldEnlarged(minYOffset,maxYOffset ){
    
    const workingMinY = minYOffset - 250;
    const workingMaxY = maxYOffset;
    setTimeout(()=>{
      if (window.scrollY > workingMinY && window.scrollY < workingMaxY){
        if (this.someEventIsEnlarged(this.state.musicEvents)){
          this.gescrolledBuitenBeeldEnlarged(minYOffset, maxYOffset);
        }
        return;
      } else {
        this.sluitEnlarged();
      }
    }, 100)
  }

  async sluitEnlarged(){
    console.log('sluit enlarged');
    let nieuweEventsState = this.state.musicEvents.map(event => {
      event.enlarged = false;
      return event;
    })
    this.setState({ musicEvents: nieuweEventsState }, ()=>{
      console.log('na set state')
    });    
    
    await this.waitFor(10);
    return this.recursieveStijlEraf();
    
  }

  async recursieveStijlEraf(){
    console.log('recursieve stijl eraf')
    document.querySelectorAll('.event-block[style]').forEach(el => {
      el.setAttribute('data-was-enlarged', true);
      el.removeAttribute('style')
    })
    if (document.querySelector('.event-block[style]')){
      await this.waitFor(10);
      return this.recursieveStijlEraf()
    } else if (document.querySelector('[data-was-enlarged')){
      await this.waitFor(5);
      const wasEnlarged = document.querySelector('[data-was-enlarged');
      window.scrollTo(0, wasEnlarged.offsetTop + document.getElementById("app-banner-top").clientHeight - 75);
      wasEnlarged.removeAttribute('data-was-enlarged');
    }
    return true;
    
  }

  async loadLongerText(musicEventKey) {


    const isMomenteelEnlarged = !!this.someEventIsEnlarged(this.state.musicEvents);
    await this.sluitEnlarged();
    //document.querySelectorAll('.event-block[style]').forEach(el => el.removeAttribute('style'))
    const thisEvent = this.state.musicEvents[musicEventKey];
    const thisElement = document.getElementById(`event-id-${musicEventKey}`);
    let readyToLoad = false;
    // alles ontlargen.
    
    let nieuweEventsState = this.state.musicEvents.map(event => {
      event.enlarged = false;
      return event;
    })
    this.setState({ musicEvents: nieuweEventsState }, ()=>{
      console.log('na set state')
      readyToLoad = true;
    });
    
    if (isMomenteelEnlarged) {
      return; 
    }

    if (readyToLoad){
      console.log('verdomme wat snel!')
    }

    if (!thisEvent.longText) {
      console.log('geen longtekst')
      return;
    }

    const initialElementOffsetTop = thisElement.offsetTop;

    await fetch(thisEvent.longText.replace("../public/", "/"), {})
      .then((response) => response.text())
      .then((text) => {
        let oldEvents = this.state.musicEvents;
        oldEvents[musicEventKey].enlarged = true;
        oldEvents[musicEventKey].longTextHTML = text;
        this.setState({ musicEvents: [...oldEvents] });

        setTimeout(() => {
          const blockEl = document.getElementById(`event-id-${musicEventKey}`);
          const appBannerHeight =
            document.getElementById("app-banner").clientHeight;
          if (window.innerWidth > 1024){
            console.log(document.body.offsetHeight, thisElement.offsetHeight, initialElementOffsetTop)
            const maxOffset = Math.max(Math.min((document.body.offsetHeight - thisElement.offsetHeight - 150), initialElementOffsetTop - 50), 50);
            thisElement.setAttribute('style', `top: ${maxOffset}px`)
          }            
          window.scrollTo(0, blockEl.offsetTop + appBannerHeight - 20);
        }, 360);
        setTimeout(()=>{
          const blockEl = document.getElementById(`event-id-${musicEventKey}`);
          this.gescrolledBuitenBeeldEnlarged(blockEl.offsetTop, blockEl.offsetTop + blockEl.scrollHeight)  
        }, 750)
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
    
    const start = new Date(musicEvent.start);
    const enlargedBEM = musicEvent.enlarged ? 'event-block__dates--enlarged' : '';
    const startDateText = start.toLocaleDateString("nl", {
      weekday: musicEvent.enlarged ? "short" : undefined,
      month: musicEvent.enlarged ? 'long' : '2-digit',
      day: "numeric",
      year: musicEvent.enlarged 
        ? (start.getFullYear() === this.currentYear ? "numeric" : undefined)
        : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
    const startDateHTML = `<time className="event-block__dates event-block__dates--start-date ${enlargedBEM}" dateTime="${musicEvent.start}">${startDateText}</time>`;
    if (!musicEvent.enlarged){
      return startDateHTML;
    }

    let openDoorDateHTML = '';
    if (musicEvent.door) {
      const deurTijd = musicEvent.door.match(/T(\d\d:\d\d)/)[1]
      openDoorDateHTML = `<time className="event-block__dates event-block__dates--door-date ${enlargedBEM}" dateTime="${musicEvent.door}">deur: ${deurTijd}</time>`;
    }

    let endDateHTML = '';
    if (musicEvent.end) {
      // const endText = (new Date(musicEvent.door)).toLocaleDateString("nl", {
      //   hour: "2-digit",
      //   minute: "2-digit",
      // });      
      const eindTijd = musicEvent.end.match(/T(\d\d:\d\d)/)[1]
      endDateHTML = `<time className="event-block__dates event-block__dates--end-date ${enlargedBEM}" dateTime="${musicEvent.end}">eind: ${eindTijd}</time>`;
    }
    
    return `${startDateHTML}${openDoorDateHTML}${endDateHTML}`;
    
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
    if (!musicEvent.enlarged) return '';
    return <p className={`${selectors.headerShortText}`}>
      {musicEvent.shortText}
    </p>
  }

  createShortestText(musicEvent){
    if (!musicEvent.shortText) return '';
    const m = 15;
    const splitted = musicEvent.shortText?.split(' ') ?? null;
    if (!splitted) return '';
    let s = splitted.splice(0, m).join(' ') ?? '';
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
      sluitEnlargedBtn: `${BEMify(`event-block__sluit-enlarged-btn`, sharedModifiers)}`,
      image: BEMify('event-block__image', sharedModifiers),
      dates: `${BEMify(`event-block__dates event-block__header-text contrast-with-dark`, sharedModifiers)}`,
      headerShortText: `${BEMify(`event-block__paragraph event-block__header-text contrast-with-dark`, ['short-text', ...sharedModifiers])} `,
      main: `${BEMify(`event-block__main contrast-with-dark`, sharedModifiers)}`,
      mainContainerForEnlarged: BEMify(`void-container-for-enlarged`, sharedModifiers),
      footer: `${BEMify(`event-block__footer`, sharedModifiers)} `,
    }    
  }

  someEventIsEnlarged(musicEvents){
    return musicEvents.find(musicEvent => musicEvent.enlarged);
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
        const eventTime = new Date(musicEvent.start).getTime();

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
      const start = new Date(musicEvent.start);
      musicEvent.eventMonth = start.toLocaleDateString("nl", {
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
    const enlargedClassAddition = this.someEventIsEnlarged(this.state.musicEvents) ? 'some-event-is-enlarged' : 'nothing-is-enlarged';
    return (
      <div className={`event-block__wrapper ` + enlargedClassAddition}>

        {musicEvents.map((musicEvent, musicEventKey) => {
          const sharedModifiers = [musicEvent.location, musicEvent.soldOut ? 'sold-out' : '', musicEvent.enlarged ? 'enlarged': ''];
          const selectors = this.getSelectors(musicEvent,sharedModifiers);
          const priceElement = this.priceElement(musicEvent);
          const datesHTML = this.createDates(musicEvent);
          const numberOfDates = datesHTML.match(/<time/g).length;
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
              onClick={!musicEvent.enlarged ? this.loadLongerText.bind(this, musicEventKey) : null}
              className={selectors.article}
            >
              {firstOfMonthBlock}
              {imageHTML}
              <header className={selectors.header}>
                <h2 className={selectors.headerH2}>
                  <span className={selectors.headerEventTitle} data-short-text={shortestText}>
                    {musicEvent.title}
                  </span>
                  <span className={selectors.headerLocation + ' number-of-dates-'+numberOfDates}>
                    {this.createLocation(musicEvent)}
                    <span
                      dangerouslySetInnerHTML={{
                        __html: datesHTML,
                      }}
                    ></span>
                  </span>
                </h2>
                <button onClick={this.sluitEnlarged} className={selectors.sluitEnlargedBtn}>
                  <img src={closeIcon} width='40' height='40'alt='sluit uitgelicht scherm'/>
                </button>
              </header>
              <section className={selectors.main}>
                {shortTextHTML}
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
        <LoadmoreButton 
          musicEventsLength={this.state.musicEvents.length} 
          maxEventsShown={this.state.maxEventsShown}
          eventDataLoaded={this.state.eventDataLoaded}
          add100ToMaxEventsShown={this.add100ToMaxEventsShown}
        ></LoadmoreButton>

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

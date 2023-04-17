import React from "react";


class EventBlocks extends React.Component {
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
    this.createStartMoment = this.createStartMoment.bind(this);
    this.add100ToMaxEventsShown = this.add100ToMaxEventsShown.bind(this);
  }

  componentDidUpdate() {
    if (!this.state.eventDataLoaded && !this.state.eventDataLoading) {
      this.getEventData();
    }
  }
  async getEventData() {
    this.setState({ eventDataLoading: true });
    return await fetch("./events-list.json", {})
      .then((response) => {
        return response.json();
      })
      .then((musicEvents) => {
        let me2 = musicEvents
          .map(frontendMusicEventExpansionMap)
          .filter(musicEventDateFilter);
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
  add100ToMaxEventsShown() {
    const oldMax = this.state.maxEventsShown;
    const posMax = oldMax + 100;
    const newMax = Math.min(posMax, this.state.musicEvents.length);
    this.setState({
      maxEventsShown: newMax,
    });
  }

  async loadLongerText(musicEventKey, buttonClicked) {
    buttonClicked.target.classList.add("hidden");
    const thisEvent = this.state.musicEvents[musicEventKey];
    if (!thisEvent.longText) {
      return;
    }

    await fetch(thisEvent.longText.replace("../public/", "/"), {})
      .then((response) => {
        const rrr = response.text();
        return rrr;
      })
      .then((text) => {
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
      });
  }

  priceElement(musicEvent) {

    let price;
    if (musicEvent?.origin === 'ticketmaster'){
      price = musicEvent?.price 
        ? `€ ${Number(musicEvent?.price)
          .toFixed(2)
          .toString()
          .replace(".", ",")}`
        : '€?'
    } else {
      price = musicEvent?.price 
        ? `€ ${Number(musicEvent?.price)
          .toFixed(2)
          .toString()
          .replace(".", ",")}`
        : 'gratis'      
    }

    return musicEvent?.price !== null ? (
      <span className={`event-block__price contrast-with-dark sans-serif-font ${musicEvent.soldOut ? "event-block__price--sold-out" : ""}`}>
        {musicEvent.soldOut ? "" : price}
        {this.createLinkToVenue(musicEvent)} 
      </span>
    ) : (
      ""
    );
  }

  createStartMoment(musicEvent) {
    const StartDateTime = new Date(musicEvent.startDateTime);
    if (StartDateTime.getFullYear() === this.currentYear) {
      return StartDateTime.toLocaleDateString("nl", {
        weekday: "short",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return StartDateTime.toLocaleDateString("nl", {
        weekday: "short",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  createLinkToVenue(musicEvent) {
    const url = musicEvent.venueEventUrl;
    const soldOut = musicEvent.soldOut;
    if (!url) return '';

    return soldOut ? (
      <span
        className="event-block__venue-link sans-serif-font event-block__venue-link--sold-out" title='Ik zoek nog uit hoe door te verwijzen naar ticketswap ofzo. Thx'
      >
        uitverkocht
      </span>      
    ) : (
      <a
        className="event-block__venue-link sans-serif-font"
        href={url}
        target="_blank"
      >
        tickets
      </a>
    );
  }

  createImageHTML(musicEvent) {
    const imgSrc =
      musicEvent.image ?? `location-images/${musicEvent.location}.jpg`;
    return imgSrc ? (
      <img
        className={`event-block--image ${musicEvent.soldOut ? "event-block--image-blurred" : ""}`}
        src={imgSrc}
        alt={musicEvent.title}
        loading="lazy"
      />
    ) : (
      ""
    );
  }

  createMoreButtonHTML(musicEvent, musicEventKey) {
    return musicEvent.longText ? (
      <button
        className={`event-block__load-more sans-serif-font ${musicEvent.soldOut ? "event-block__load-more--blurred" : ""}`}
        onClick={this.loadLongerText.bind(this, musicEventKey)}
      >
        more
      </button>
    ) : (
      ""
    );
  }
  createLocation(musicEvent) {
    const locationObj = this.props.locations[musicEvent.location] ?? null;
    if (!locationObj) {
      return musicEvent.location;
    }
    return `${locationObj.name} ${locationObj.city}`;
  }

  stripHTML(text) {
    if (!text) return "";
    return text.replace(/<\/?\w+>/g, "");
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
      <div className="event-block__wrapper">
        {musicEvents.map((musicEvent, musicEventKey) => {
          const priceElement = this.priceElement(musicEvent);
          const startMomentLang = this.createStartMoment(musicEvent);
          const linkToVenueHTML = this.createLinkToVenue(musicEvent);
          const imageHTML = this.createImageHTML(musicEvent);
          const articleID = `event-id-${musicEventKey}`;
          const moreButtonHTML = this.createMoreButtonHTML(
            musicEvent,
            musicEventKey
          );
          const firstOfMonthBlock = musicEvent.firstOfMonth ? (
            <time className="event-block__first-of-month">
              {musicEvent.eventMonth}
            </time>
          ) : (
            ""
          );
          return (
            <article
              id={articleID}
              key={musicEventKey}
              data-date={musicEvent.eventMonth}
              className={`event-block provide-dark-contrast ${
                musicEvent.enlarged ? "event-block--enlarged" : ""
              } ${
                musicEvent.soldOut ? "event-block--sold-out" : ""
              } ${
                musicEvent.firstOfMonth ? "event-block--first-of-month" : ""
              }`}
            >
              {firstOfMonthBlock}
              {imageHTML}
              <header className="event-block__header contrast-with-dark">
                <h2 className="event-block__title contrast-with-dark">
                  <span className={`event-block__title-showname cursive-font ${musicEvent.soldOut ? "event-block__title-showname--blurred" : ""}`}>
                    {musicEvent.title}
                  </span>
                  <span className={`event-block__title-location ${musicEvent.soldOut ? "event-block__title-location--blurred" : ""}`}>
                    {this.createLocation(musicEvent)}
                  </span>

                  <span className="event-block__startDate contrast-with-dark">
                    {startMomentLang}
                  </span>
                </h2>
                <p
                  className={`event-block__paragraph event-block__paragraph--short-text contrast-with-dark ${
                    musicEvent.enlarged ? "hidden" : ""
                  }`}
                >
                  {this.stripHTML(musicEvent.shortText)}
                </p>
                {priceElement}
              </header>
              <section className="event-block__main contrast-with-dark">
                {moreButtonHTML}
                <div
                  className="void-container-for-enlarged"
                  dangerouslySetInnerHTML={{
                    __html: musicEvent.longTextHTML,
                  }}
                ></div>
                <footer className="event-block__footer contrast-with-dark">
                  {linkToVenueHTML}
                </footer>
              </section>
            </article>
          );
        })}
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

/**
 * To be used in filter method. Removes those events that are past or dont have a startDateTime
 * @param {*} musicEvent 
 * @returns bool
 */
function musicEventDateFilter(musicEvent) {
  if (!musicEvent.startDateTime) {
    return false;
  }
  const musicEventTime = Number(
    musicEvent.startDateTime.match(/(.*)T/)[1].replace(/\D/g, "")
  );
  const nowDateString = new Date();
  const nowDate = Number(
    nowDateString.toISOString().match(/(.*)T/)[1].replace(/\D/g, "")
  );
  return musicEventTime >= nowDate;
}

export default EventBlocks;

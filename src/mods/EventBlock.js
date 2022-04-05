import React from "react";

class EventBlock extends React.Component {
  state = {
    musicEvents: [],
  };

  constructor(props) {
    super(props);

    getData()
      .then((musicEvents) => {
        let me2 = musicEvents
          .map(frontendMusicEventExpansionMap)
          .filter(musicEventDateFilter);
        this.setState({ musicEvents: me2 });
      })
      .catch((error) => {
        console.error(error);
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
          window.scrollTo(0, blockEl.offsetTop);
        }, 360);
      });
  }

  priceElement(musicEvent) {
    const price = `€${Number(musicEvent.price).toFixed(2)}`;
    return musicEvent.price !== null ? (
      <span className="event-block__price contrast-with-dark">{price}</span>
    ) : (
      ""
    );
  }

  createStartMoment(musicEvent) {
    return new Date(musicEvent.startDateTime).toLocaleDateString("nl", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  createLinkToVenue(musicEvent) {
    const url = musicEvent.venueEventUrl;
    return !!musicEvent.venueEventUrl ? (
      <a className="event-block__venue-link" href={url} target="_blank">
        get your tickets<br></br>
        at the venue
      </a>
    ) : (
      ""
    );
  }

  createImageHTML(musicEvent) {
    return !!musicEvent.image ? (
      <img
        className="event-block--image"
        src={musicEvent.image}
        alt={musicEvent.title}
        loading="lazy"
      />
    ) : (
      ""
    );
  }

  createMoreButtonHTML(musicEvent, musicEventKey) {
    return !!musicEvent.longText ? (
      <button
        className="event-block__load-more"
        onClick={this.loadLongerText.bind(this, musicEventKey)}
      >
        more
      </button>
    ) : (
      ""
    );
  }

  render() {
    const musicEvents = this.state.musicEvents;

    return (
      <div className="event-block__wrapper">
        {musicEvents.map((musicEvent, musicEventKey) => {
          const titlePlus = musicEvent.title + " in " + musicEvent.location;
          const priceElement = this.priceElement(musicEvent);
          const startMomentLang = this.createStartMoment(musicEvent);
          const linkToVenueHTML = this.createLinkToVenue(musicEvent);
          const imageHTML = this.createImageHTML(musicEvent);
          const articleID = `event-id-${musicEventKey}`;
          const moreButtonHTML = this.createMoreButtonHTML(
            musicEvent,
            musicEventKey
          );
          return (
            <article
              id={articleID}
              key={musicEventKey}
              className={`event-block provide-dark-contrast ${
                musicEvent.enlarged ? "event-block--enlarged" : ""
              }`}
            >
              {imageHTML}
              <header className="event-block__header contrast-with-dark">
                <h1 className="event-block__title contrast-with-dark">
                  {titlePlus}
                  <span className="event-block__startDate contrast-with-dark">
                    {startMomentLang}
                  </span>
                </h1>
                {priceElement}
              </header>
              <section className="event-block__main contrast-with-dark">
                <p
                  className={`event-block__paragraph contrast-with-dark ${
                    musicEvent.enlarged ? "hidden" : ""
                  }`}
                >
                  {musicEvent.shortText}
                </p>

                {moreButtonHTML}
                <div
                  dangerouslySetInnerHTML={{ __html: musicEvent.longTextHTML }}
                ></div>
                <footer className="event-block__footer contrast-with-dark">
                  {linkToVenueHTML}
                </footer>
              </section>
            </article>
          );
        })}
      </div>
    );
  }
}

async function getData() {
  const musicEvents = await fetch("./events-list.json", {}).then((response) => {
    return response.json();
  });

  return musicEvents;
}

function frontendMusicEventExpansionMap(musicEvent) {
  return {
    ...musicEvent,
    longTextHTML: null,
    enlarged: false,
  };
}

function musicEventDateFilter(musicEvent) {
  if (!musicEvent.startDateTime) {
    return false;
  }
  const musicEventTime = new Date(musicEvent.startDateTime).getDate();
  const nowDate = new Date().getDate();
  return musicEventTime >= nowDate;
}

export default EventBlock;

import React from "react";

class EventBlock extends React.Component {
  state = {
    musicEvents: [],
  };

  constructor(props) {
    super(props);
  }

  componentDidMount() {
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
          const appBannerHeight =
            document.getElementById("app-banner").clientHeight;
          window.scrollTo(0, blockEl.offsetTop + appBannerHeight);
        }, 360);
      });
  }

  priceElement(musicEvent) {
    const price = `€ ${Number(musicEvent.price)
      .toFixed(2)
      .toString()
      .replace(".", ",")}`;
    return musicEvent.price !== null ? (
      <span className="event-block__price contrast-with-dark sans-serif-font">
        {price}
        {this.createLinkToVenue(musicEvent)}
      </span>
    ) : (
      ""
    );
  }

  createStartMoment(musicEvent) {
    return new Date(musicEvent.startDateTime).toLocaleDateString("nl", {
      weekday: "short",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  createLinkToVenue(musicEvent) {
    const url = musicEvent.venueEventUrl;
    return !!musicEvent.venueEventUrl ? (
      <a
        className="event-block__venue-link sans-serif-font"
        href={url}
        target="_blank"
      >
        tickets
      </a>
    ) : (
      ""
    );
  }

  createImageHTML(musicEvent) {
    const imgSrc =
      musicEvent.image ?? `location-images/${musicEvent.location}.jpg`;
    return !!imgSrc ? (
      <img
        className="event-block--image"
        src={imgSrc}
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
        className="event-block__load-more sans-serif-font"
        onClick={this.loadLongerText.bind(this, musicEventKey)}
      >
        more
      </button>
    ) : (
      ""
    );
  }

  stripHTML(text) {
    if (!text) return "";
    return text.replace(/\<\/?\w+\>/g, "");
  }

  render() {
    const musicEvents = this.state.musicEvents;

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
                <h2 className="event-block__title contrast-with-dark">
                  <span className="event-block__title-showname cursive-font">
                    {musicEvent.title}
                  </span>
                  <span className="event-block__title-location">
                    {musicEvent.location}
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
  console.log(musicEvents);

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
  const musicEventTime = Number(
    musicEvent.startDateTime.match(/(.*)T/)[1].replace(/\D/g, "")
  );
  const nowDateString = new Date();
  const nowDate = Number(
    nowDateString.toISOString().match(/(.*)T/)[1].replace(/\D/g, "")
  );
  return musicEventTime >= nowDate;
}

export default EventBlock;

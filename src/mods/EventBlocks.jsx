import React from "react";
import { BEMify, waitFor } from "./util.js";
import closeIcon from "../images/close.png";
import LoadmoreButton from "./LoadmoreButton.jsx";
import EventBlocksUtil from "./EventBlocksUtil.jsx";
import EventBlocksImage from "./EventBlocksImage.jsx";
import EventBlocksPrice from "./EventBlocksPrice.jsx";

class EventBlocks extends React.Component {
    // #region constructor en life cycle

    constructor(props) {
        super(props);
        this.state = {
            filteredMusicEvents: [],
            eventDataLoading: false,
            filterHideSoldOut: false,
            sendDataUp: false,
            firstFilteringDone: false,
            lastRegionFilter: ["all"],
            maxEventsShown: 100
        };
        this.currentYear = new Date().getFullYear();

        this.musicEventsLength = null;
        this.createLocationHTML = this.createLocationHTML.bind(this);
        this.add100ToMaxEventsShown = this.add100ToMaxEventsShown.bind(this);
        this.escFunction = this.escFunction.bind(this);
        this.hideSoldOut = this.hideSoldOut.bind(this);
        this.addFirstOfMonth = this.addFirstOfMonth.bind(this);
        this.gescrolledBuitenBeeldEnlarged =
            this.gescrolledBuitenBeeldEnlarged.bind(this);
    }

    componentDidMount() {
        document.addEventListener("keydown", this.escFunction, false);

        this.musicEventFilters();
        this.sluitEnlarged = this.sluitEnlarged.bind(this);
    }

    componentDidUpdate() {
        const sortedLastFilterString = this.state.lastRegionFilter
            .sort()
            .join("-");
        const unsortedCurFilter = this.props.regionFilterSelectedOptions;
        const sortedCurFilterString = unsortedCurFilter.sort().join("-");
        if (sortedLastFilterString !== sortedCurFilterString) {
            this.musicEventFilters();
        }
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.escFunction, false);
    }

    // #endregion constructor en life cycle

    // #region fetch methoden getEventData en loadLongerText

    async waitForHasFetchedData() {
        const { hasFetchedData } = this.props;
        if (hasFetchedData) return true;
        else {
            await waitFor(50);
            return this.waitForHasFetchedData();
        }
    }

    createLocationHTML(musicEvent) {
        return (
            <span>
                <span className="event-block__location-row">
                    {musicEvent.location.name}
                </span>
                <span className="event-block__location-row">
                    {musicEvent.location.city}
                </span>
            </span>
        );
    }

    // eslint-disable-next-line
    createShortTextHTML(musicEvent, selectors) {
        if (!musicEvent.shortText) return "";
        if (!musicEvent.enlarged) return "";
        return (
            <p className={`${selectors.headerShortText}`}>
                {musicEvent.shortText}
            </p>
        );
    }

    async recursieveStijlEraf() {
        document.querySelectorAll(".event-block[style]").forEach((el) => {
            el.setAttribute("data-was-enlarged", true);
            el.removeAttribute("style");
        });

        if (document.querySelector(".event-block[style]")) {
            await waitFor(10);
            return this.recursieveStijlEraf();
        }
        if (document.querySelector("[data-was-enlarged")) {
            await waitFor(5);
            const wasEnlarged = document.querySelector("[data-was-enlarged");
            window.scrollTo(
                0,
                wasEnlarged.offsetTop +
                    document.getElementById("app-banner-top").clientHeight -
                    75
            );
            wasEnlarged.removeAttribute("data-was-enlarged");
        }
        return true;
    }

    hideSoldOut(e) {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        this.setState({ filterHideSoldOut: true });
    }

    async loadLongerText(musicEventKey, e) {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();

        let { filteredMusicEvents } = this.state;
        const isMomenteelEnlargedEl = this.someEventIsEnlarged();
        const isMomenteelEnlarged = !!isMomenteelEnlargedEl;
        await this.sluitEnlarged();

        const thisEvent = filteredMusicEvents[musicEventKey];
        const thisElement = document.getElementById(
            `event-id-${musicEventKey}`
        );

        filteredMusicEvents = filteredMusicEvents.map((event) => {
            event.enlarged = false; // eslint-disable-line
            return event;
        });

        if (isMomenteelEnlarged || !thisEvent.longText) {
            return;
        }

        const initialElementOffsetTop = thisElement.offsetTop;

        await fetch(thisEvent.longText.replace("../public/", "/"), {})
            .then((response) => response.text())
            .then((text) => {
                // eslint-disable-next-line

                filteredMusicEvents[musicEventKey].enlarged = true;
                filteredMusicEvents[musicEventKey].longTextHTML = text;
                this.setState({
                    filteredMusicEvents
                });
                setTimeout(() => {
                    const blockEl = document.getElementById(
                        `event-id-${musicEventKey}`
                    );

                    if (window.innerWidth > 1024) {
                        const maxOffset = Math.max(
                            Math.min(
                                document.body.offsetHeight -
                                    thisElement.offsetHeight -
                                    150,
                                initialElementOffsetTop - 50
                            ),
                            50
                        );
                        thisElement.setAttribute(
                            "style",
                            `top: ${maxOffset}px`
                        );
                    }
                    window.scrollTo(0, blockEl.offsetTop - 20);
                }, 360);
                setTimeout(() => {
                    const blockEl = document.getElementById(
                        `event-id-${musicEventKey}`
                    );
                    this.gescrolledBuitenBeeldEnlarged(
                        blockEl.offsetTop,
                        blockEl.offsetTop + blockEl.scrollHeight
                    );
                }, 750);
            })
            .catch((err) => {
                console.error(err); // FIXME melding maken in app
            });
    }

    // #endregion fetch methoden getEventData en loadLongerText

    // #region event-block HTML methods

    async sluitEnlarged(e = null) {
        if (e) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
        }
        // document.querySelectorAll('.void-container-for-enlarged--enlarged')
        //   .forEach(voidEl=>voidEl.innerHTML = '')
        const { filteredMusicEvents } = this.state;
        const nieuweEventsState = filteredMusicEvents.map((event) => {
            // eslint-disable-next-line
            event.enlarged = false;
            return event;
        });
        this.setState({ filteredMusicEvents: nieuweEventsState });

        await waitFor(10);
        return this.recursieveStijlEraf();
    }

    escFunction(event) {
        if (event.key === "Escape") {
            this.sluitEnlarged();
        }
    }

    gescrolledBuitenBeeldEnlarged(minYOffset, maxYOffset) {
        const workingMinY = minYOffset - 250;
        const workingMaxY = maxYOffset;
        setTimeout(() => {
            if (window.scrollY > workingMinY && window.scrollY < workingMaxY) {
                if (this.someEventIsEnlarged()) {
                    this.gescrolledBuitenBeeldEnlarged(minYOffset, maxYOffset);
                }
            } else {
                this.sluitEnlarged();
            }
        }, 100);
    }

    // eslint-disable-next-line
    someEventIsEnlarged() {
        const { filteredMusicEvents } = this.state;
        return filteredMusicEvents.find((musicEvent) => musicEvent.enlarged);
    }

    createHideSoldOutBtn(musicEvent, selectors) {
        if (!musicEvent.soldOut) return "";
        if (musicEvent.enlarged) return "";
        return (
            <button
                type="button"
                onClick={this.hideSoldOut}
                className={`${selectors.hideSoldOutBtn}`}
            >
                uitverkocht verbergen
            </button>
        );
    }

    // #endregion event-block HTML methods

    add100ToMaxEventsShown() {
        console.log(`add 100 to max events shown draait`);
        const { maxEventsShown } = this.state;
        let newMax = maxEventsShown + 100;
        if (newMax > this.musicEventsLength) {
            newMax = this.musicEventsLength;
        }
        this.setState({
            maxEventsShown: newMax
        });
    }

    async musicEventFilters() {
        await this.waitForHasFetchedData();

        const { eventBlocksNaarApp, regionFilterSelectedOptions, musicEvents } =
            this.props;

        const musicEventsCopy = JSON.parse(JSON.stringify(musicEvents));
        this.musicEventsLength = musicEventsCopy.length;

        const musicEventsInRegion = regionFilterSelectedOptions.includes("all")
            ? musicEventsCopy
            : musicEventsCopy.filter((musicEvent) => {
                  return regionFilterSelectedOptions.includes(
                      musicEvent.location.region
                  );
              });

        this.setState({
            filteredMusicEvents: musicEventsInRegion,
            firstFilteringDone: true
        });

        eventBlocksNaarApp(musicEventsInRegion.length);
        this.setState({
            sendDataUp: true,
            lastRegionFilter: [...regionFilterSelectedOptions]
        });

        return musicEventsInRegion;
    }

    render() {
        const { hasFetchedData } = this.props;
        const { maxEventsShown } = this.state;
        if (!hasFetchedData) return "";

        const enlargedClassAddition = this.someEventIsEnlarged()
            ? "some-event-is-enlarged"
            : "nothing-is-enlarged";
        const { eventDataLoading, filterHideSoldOut, filteredMusicEvents } =
            this.state;

        if (!filteredMusicEvents.length) {
            return "";
        }

        const mel = filteredMusicEvents.length;
        let monthEvenOddCounter = 0;

        const printThis = EventBlocksUtil.addFirstOfMonth(
            filteredMusicEvents
                // bewerktMusicEventTitle doet allemaal vage dingen door elkaar sooals shortesttesttext maken
                .map(EventBlocksUtil.bewerktMusicEventTitle)
        );

        return (
            <div
                className={`event-block__wrapper ${enlargedClassAddition} ${
                    eventDataLoading ? "is-loaded" : "not-loading"
                }`}
            >
                {
                    printThis
                        .filter((musicEvent, index) => {
                            if (index + 1 > maxEventsShown) return false;
                            return true;
                        })
                        .map((musicEvent, musicEventKey) => {
                            if (musicEvent.firstOfMonth) {
                                monthEvenOddCounter += 1;
                            }
                            if (musicEvent.soldOut && filterHideSoldOut)
                                return "";

                            const sharedModifiers = [
                                musicEvent.location.slug,
                                musicEvent.soldOut ? "sold-out" : "",
                                musicEvent.enlarged ? "enlarged" : ""
                            ];
                            const selectors = EventBlocksUtil.getSelectors(
                                musicEvent,
                                sharedModifiers,
                                monthEvenOddCounter
                            );

                            const datesHTML =
                                EventBlocksUtil.createDates(musicEvent);
                            const hideSoldOutBtn = this.createHideSoldOutBtn(
                                musicEvent,
                                selectors
                            );
                            const numberOfDates =
                                datesHTML.match(/<time/g).length;

                            const articleID = `event-id-${musicEventKey}`;
                            const firstOfMonthBlock =
                                musicEvent.firstOfMonth ? (
                                    <time className="event-block__first-of-month-time">
                                        {musicEvent.eventMonth}
                                    </time>
                                ) : (
                                    ""
                                );

                            const shortTextHTML = this.createShortTextHTML(
                                musicEvent,
                                selectors
                            );

                            return (
                                // eslint-disable-next-line
                                <article
                                    id={articleID}
                                    // eslint-disable-next-line
                                    key={musicEventKey}
                                    data-date={musicEvent.eventMonth}
                                    className={selectors.article}
                                    onClick={
                                        !musicEvent.enlarged &&
                                        musicEvent.longText
                                            ? this.loadLongerText.bind(
                                                  this,
                                                  musicEventKey
                                              )
                                            : null
                                    }
                                    title={
                                        musicEvent.longText
                                            ? ""
                                            : "geen verdere info beschikbaar"
                                    }
                                >
                                    {firstOfMonthBlock}
                                    <EventBlocksImage
                                        musicEvent={musicEvent}
                                        imageClassName={selectors.image}
                                    />
                                    <header className={selectors.header}>
                                        <h2 className={selectors.headerH2}>
                                            <span
                                                className={
                                                    selectors.headerEventTitle
                                                }
                                                data-short-text={
                                                    musicEvent.shortestText
                                                }
                                            >
                                                {musicEvent.title}
                                            </span>
                                            <span
                                                className={`${selectors.headerLocation} number-of-dates-${numberOfDates}`}
                                            >
                                                {this.createLocationHTML(
                                                    musicEvent
                                                )}
                                                <span
                                                    dangerouslySetInnerHTML={{
                                                        __html: datesHTML
                                                    }}
                                                />
                                            </span>
                                        </h2>
                                        <button
                                            type="button"
                                            onClick={this.sluitEnlarged}
                                            className={
                                                selectors.sluitEnlargedBtn
                                            }
                                        >
                                            <img
                                                src={closeIcon}
                                                width="40"
                                                height="40"
                                                alt="sluit uitgelicht scherm"
                                            />
                                        </button>
                                    </header>
                                    <section className={selectors.main}>
                                        {shortTextHTML}
                                        <div
                                            className={
                                                selectors.mainContainerForEnlarged
                                            }
                                            dangerouslySetInnerHTML={{
                                                __html: musicEvent.enlarged
                                                    ? musicEvent.longTextHTML
                                                    : ""
                                            }}
                                        />
                                        <footer className={selectors.footer}>
                                            <EventBlocksPrice
                                                musicEvent={musicEvent}
                                            />
                                        </footer>
                                    </section>
                                    {hideSoldOutBtn}
                                </article>
                            );
                        }) // article mapper
                }
                <LoadmoreButton
                    musicEventsLength={mel}
                    maxEventsShown={maxEventsShown}
                    eventDataLoaded={!eventDataLoading}
                    add100ToMaxEventsShown={this.add100ToMaxEventsShown}
                />
            </div>
        );
    }
}

export default EventBlocks;

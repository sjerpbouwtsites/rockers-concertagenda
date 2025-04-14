import React from "react";
import { BEMify, filterEventsDateInPast, waitFor } from "./util.js";
import closeIcon from "../images/close.png";
import LoadmoreButton from "./LoadmoreButton.jsx";

class EventBlocks extends React.Component {
    // #region constructor en life cycle

    constructor(props) {
        super(props);
        this.state = {
            filteredMusicEvents: [],
            eventDataLoading: false,
            eventDataLoaded: false,
            filterHideSoldOut: false,
            sendDataUp: false,
            firstFilteringDone: false,
            lastRegionFilter: ["all"]
        };
        this.currentYear = new Date().getFullYear();
        this.maxEventsShown = 100;
        this.musicEventsLength = null;
        this.createLocationHTML = this.createLocationHTML.bind(this);
        this.createDates = this.createDates.bind(this);
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

    // eslint-disable-next-line
    getSelectors(musicEvent, sharedModifiers, monthEvenOddCounter) {
        const isEven = monthEvenOddCounter % 2 === 0;
        return {
            article: `
provide-dark-contrast
${isEven ? "provide-dark-contrast--variation-1" : ""}
${BEMify("event-block", [
    musicEvent.location.slug,
    musicEvent.enlarged ? "enlarged" : "",
    musicEvent.soldOut ? "sold-out" : "",
    musicEvent.firstOfMonth ? "first-of-month" : "",
    musicEvent.soldOut ? "sold-out" : "",
    musicEvent.title.length > 36 ? "long-title" : "short-title",
    musicEvent.title.length < 16 ? "tiny-title" : "",
    musicEvent.longText ? "interactive" : "no-longTextHTML",
    Math.random() > 0.8 ? "random-style" : "",
    Math.random() > 0.5 ? "random-style-2" : "",
    Math.random() > 0.5 ? "random-style-3" : ""
])}`,

            header: `${BEMify("event-block__header contrast-with-dark", sharedModifiers)}`,
            headerH2: `${BEMify("contrast-with-dark event-block__title", sharedModifiers)}`,
            headerEventTitle: `${BEMify(
                "event-block__title-showname plain-sans-serif-font",
                sharedModifiers
            )}`,
            headerLocation: `${BEMify(
                "event-block__title-location color-green green-color event-block__header-text cursive-font",
                sharedModifiers
            )}`,
            sluitEnlargedBtn: `${BEMify("event-block__sluit-enlarged-btn", sharedModifiers)}`,
            image: BEMify("event-block__image", sharedModifiers),
            dates: `${BEMify(
                "event-block__dates event-block__header-text contrast-with-dark",
                sharedModifiers
            )}`,
            headerShortText: `${BEMify(
                "event-block__paragraph event-block__header-text contrast-with-dark",
                ["short-text", ...sharedModifiers]
            )} `,
            main: `${BEMify("event-block__main contrast-with-dark", sharedModifiers)}`,
            mainContainerForEnlarged: BEMify(
                "void-container-for-enlarged",
                sharedModifiers
            ),
            footer: `${BEMify("event-block__footer", sharedModifiers)} `,
            hideSoldOutBtn: `${BEMify("event-block__hide-sold-out", sharedModifiers)} `
        };
    }

    createDates(musicEvent) {
        // FIXME naar eigen component
        const start = new Date(musicEvent.start);
        const enlargedBEM = musicEvent.enlarged
            ? "event-block__dates--enlarged"
            : "";

        let year;
        if (
            musicEvent.enlarged &&
            musicEvent.start.substring(0, 4) === this.currentYear
        ) {
            year = "numeric";
        }
        const startDateText = start.toLocaleDateString("nl", {
            // weekday: musicEvent.enlarged ? "short" : undefined,
            month: musicEvent.enlarged ? "2-digit" : "2-digit",
            day: "numeric",
            year,
            hour: "2-digit",
            minute: "2-digit"
        });
        const startDateHTML = `<time className="event-block__dates event-block__dates--start-date ${enlargedBEM}" dateTime="${musicEvent.start}">${startDateText}</time>`;
        if (!musicEvent.enlarged) {
            return startDateHTML;
        }

        let openDoorDateHTML = "";
        if (musicEvent.door) {
            const deurTijd = musicEvent.door.match(/T(\d\d:\d\d)/)[1];
            openDoorDateHTML = `<time className="event-block__dates event-block__dates--door-date ${enlargedBEM}" dateTime="${musicEvent.door}">deur: ${deurTijd}</time>`;
        }

        let endDateHTML = "";
        if (musicEvent.end) {
            // const endText = (new Date(musicEvent.door)).toLocaleDateString("nl", {
            //   hour: "2-digit",
            //   minute: "2-digit",
            // });
            const eindTijd = musicEvent.end.match(/T(\d\d:\d\d)/)[1];
            endDateHTML = `<time className="event-block__dates event-block__dates--end-date ${enlargedBEM}" dateTime="${musicEvent.end}">eind: ${eindTijd}</time>`;
        }

        return `${startDateHTML}${openDoorDateHTML}${endDateHTML}`;
    }

    // eslint-disable-next-line
    createImageHTML(musicEvent, selectors) {
        if (musicEvent?.image?.includes("https") ?? false) {
            return (
                <img
                    src={musicEvent.image}
                    width="440"
                    height="220"
                    className={selectors.image}
                    alt={musicEvent.title}
                />
            );
        }

        let imgSrc = musicEvent.image // FIXME naar eigen component
            ? `${musicEvent.image}`
            : `/location-images/${musicEvent.location.slug}`;

        imgSrc = imgSrc.replace("../public", "");

        const srcset = `${imgSrc}-w750.webp 750w`;
        const sizes = "(min-width: 480px) 750px";
        const src = `${imgSrc}-w440.webp`;

        return imgSrc ? (
            <img
                src={src}
                srcSet={srcset}
                sizes={sizes}
                width="440"
                height="220"
                className={selectors.image}
                alt={musicEvent.title}
            />
        ) : (
            ""
        );
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

    // eslint-disable-next-line
    createShortestText(musicEvent) {
        // eslint-disable-line
        if (!musicEvent.shortText) return "";
        const m = 15;
        const splitted = musicEvent.shortText?.split(" ") ?? null;
        if (!splitted) return "";
        let s = splitted.splice(0, m).join(" ") ?? "";
        if (splitted.length > m) {
            s += "...";
        }
        return s;
    }

    async recursieveStijlEraf() {
        console.log("recursieve stijl eraf");
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

        console.log(
            `dit element van ${thisElement.querySelector("h2").textContent}`
        );
        console.log(thisElement);

        filteredMusicEvents = filteredMusicEvents.map((event) => {
            event.enlarged = false; // eslint-disable-line
            return event;
        });
        // this.setState({ musicEvents }, () => {
        //     //
        // });

        if (isMomenteelEnlarged) {
            return;
        }

        if (!thisEvent.longText) {
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

    priceElement(musicEvent) {
        // eslint-disable-line
        // FIXME Naar eigen component

        let priceText = null;
        if (musicEvent.soldOut) {
            priceText = "Uitverkocht!";
        } else if (musicEvent?.price === null) {
            priceText = "€?";
        } else if (musicEvent?.price) {
            priceText = `€ ${Number(musicEvent?.price).toFixed(2).toString().replace(".", ",")}`;
        } else if (musicEvent?.origin === "ticketmaster") {
            // TODO is die origin er nog?
            priceText = "Gratis";
        } else {
            return "";
        }

        const sharedModifiers = [
            musicEvent.soldOut ? "sold-out" : "",
            musicEvent.enlarged ? "enlarged" : ""
        ];

        const priceSelectors = BEMify(
            "event-block__price anthracite-color",
            sharedModifiers
        );

        const emoji = musicEvent.soldOut ? "💀" : "🎫";
        const linkPriceWrapper = (
            <a
                className={BEMify(
                    "event-block__venue-link event-block__price-link-wrapper",
                    sharedModifiers
                )}
                href={musicEvent.venueEventUrl}
                target="_blank"
                rel="noreferrer"
            >
                <span className="ticketemoji contrast-with-dark">{emoji}</span>
                <span className={priceSelectors}>{priceText}</span>
            </a>
        );

        return linkPriceWrapper;
    }

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

        let newMax = this.maxEventsShown + 100;
        if (newMax > this.musicEventsLength) {
            newMax = this.musicEventsLength;
        }
        this.maxEventsShown = newMax;
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

        // .filter((musicEvent) => {
        //     if (!filterSettings?.daterange?.lower) {
        //         return true;
        //     }
        //     const lowerRangeTime = new Date(
        //         filterSettings.daterange.lower
        //     ).getTime();
        //     const upperRangeTime = new Date(
        //         filterSettings.daterange.upper
        //     ).getTime();
        //     const eventTime = new Date(musicEvent.start).getTime();

        //     if (lowerRangeTime > eventTime) {
        //         return false;
        //     }
        //     if (upperRangeTime < eventTime) {
        //         return false;
        //     }
        //     return true;
        // })
    }

    // eslint-disable-next-line
    bewerktMusicEventTitle(musicEvent) {
        const met = musicEvent.title;
        let shortestText = this.createShortestText(musicEvent);
        const res = {};
        const titleIsCapsArr = met
            .split("")
            .map((char) => char === char.toUpperCase());
        const noOfCapsInTitle = titleIsCapsArr.filter((a) => a).length;
        const metl = met.length;
        const toManyCapsInTitle = (metl - noOfCapsInTitle) / metl < 0.5;
        if (toManyCapsInTitle) {
            // eslint-disable-next-line
            res.title =
                met[0].toUpperCase() + met.substring(1, 500).toLowerCase();
        } else {
            res.title = met;
        }

        if (res.title.length > 45) {
            const splittingCandidates = ["+", "&", ":", ">", "•"];
            let i = 0;
            do {
                const reg2 = RegExp(`/.*${i}/`);
                const reg1 = RegExp(`/${i}.*/`);
                const beginDeel = res.title.replace(reg1, "").trim();
                const tweedeDeel = res.title.replace(reg2, "").trim();
                res.title = beginDeel;
                shortestText = `${tweedeDeel} ${shortestText}`;
                i += 1;
            } while (res.title.length > 45 && i < splittingCandidates.length);
            shortestText =
                shortestText[0].toUpperCase() +
                shortestText.substring(1, 500).toLowerCase();
        }

        if (res.title.length > 45) {
            res.title = res.title
                .replace(/\(.*\)/, "")
                .replace(/\s{2,25}/, " ");
        }
        res.shortestText = shortestText;
        return res;
    }

    /**
     * Pas vlak voor de render weet je, want na filtering,
     * welke musicEvents de eerste van de maand zijn.
     */
    addFirstOfMonth(filteredMusicEvents) {
        return filteredMusicEvents.map((musicEvent, musicEventIndex) => {
            // eslint-disable-next-line
            musicEvent.firstOfMonth = false;
            const start = new Date(musicEvent.start);
            // eslint-disable-next-line
            musicEvent.eventMonth = start.toLocaleDateString("nl", {
                year: "numeric",
                month: "short"
            });
            if (!musicEventIndex || !filteredMusicEvents[musicEventIndex - 1]) {
                // eslint-disable-next-line
                musicEvent.firstOfMonth = true;
            }
            if (
                musicEvent.eventMonth !==
                filteredMusicEvents[musicEventIndex - 1]?.eventMonth
            ) {
                // eslint-disable-next-line
                musicEvent.firstOfMonth = true;
            }
            return musicEvent;
        });
    }
    render() {
        const { hasFetchedData } = this.props;
        if (!hasFetchedData) return "";

        const enlargedClassAddition = this.someEventIsEnlarged()
            ? "some-event-is-enlarged"
            : "nothing-is-enlarged";
        const {
            eventDataLoading,
            filterHideSoldOut,
            filteredMusicEvents,
            eventDataLoaded
        } = this.state;

        if (!filteredMusicEvents.length) {
            return "";
        }

        const mel = filteredMusicEvents.length;
        let monthEvenOddCounter = 0;

        const printThis = this.addFirstOfMonth(filteredMusicEvents);

        return (
            <div
                className={`event-block__wrapper ${enlargedClassAddition} ${
                    eventDataLoading ? "is-loaded" : "not-loading"
                }`}
            >
                {
                    printThis
                        .filter((musicEvent, index) => {
                            if (index + 1 > this.maxEventsShown) return false;
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
                            const selectors = this.getSelectors(
                                musicEvent,
                                sharedModifiers,
                                monthEvenOddCounter
                            );
                            const priceElement = this.priceElement(musicEvent);
                            const datesHTML = this.createDates(musicEvent);
                            const hideSoldOutBtn = this.createHideSoldOutBtn(
                                musicEvent,
                                selectors
                            );
                            const numberOfDates =
                                datesHTML.match(/<time/g).length;
                            const imageHTML = this.createImageHTML(
                                musicEvent,
                                selectors
                            );
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

                            const titelEnShortText =
                                this.bewerktMusicEventTitle(musicEvent);

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
                                    {imageHTML}
                                    <header className={selectors.header}>
                                        <h2 className={selectors.headerH2}>
                                            <span
                                                className={
                                                    selectors.headerEventTitle
                                                }
                                                data-short-text={
                                                    titelEnShortText.shortestText
                                                }
                                            >
                                                {titelEnShortText.title}
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
                                            {priceElement}
                                        </footer>
                                    </section>
                                    {hideSoldOutBtn}
                                </article>
                            );
                        }) // article mapper
                }
                <LoadmoreButton
                    musicEventsLength={mel}
                    maxEventsShown={this.maxEventsShown}
                    eventDataLoaded={eventDataLoaded}
                    add100ToMaxEventsShown={this.add100ToMaxEventsShown}
                />
            </div>
        );
    }
}

export default EventBlocks;

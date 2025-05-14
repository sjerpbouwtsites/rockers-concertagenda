import React from "react";

import "./styles/app.css";
import "./styles/app-phone.css";
import "./styles/app-tablet.css";
import "./styles/app-huge.css";
import "./styles/colors.css";
import "./styles/fonts.css";
import "./styles/banner.css";
import "./styles/event-blocks.css";
import "./styles/header-menu.css";
import "./styles/normalize.css";
import "./styles/open-screen.css";
import "./styles/flickety.css";
import EventBlocks from "./mods/EventBlocks.jsx";
import OpenScreen from "./mods/OpenScreen.jsx";
import { filterEventsDateInPast } from "./mods/util.js";

class App extends React.Component {
    title = "Rock Agenda";
    hideTimer = null;
    constructor(props) {
        super(props);
        this.state = {
            openScreenHidden: false,
            locations: {},
            musicEvents: [],
            musicEventCount: 0,
            hasRecievedDataFromEventBlocks: false,
            filterSettings: {
                podia: {},
                daterange: {
                    lower: "2025-04-01",
                    upper: "2026-12-31"
                }
            },
            hasFetchedData: false,
            canPrintRegionsFilter: false,
            regionFilterSelectedOptions: ["all"]
        };
        // this.updateSwitch = this.updateSwitch.bind(this);
        // this.updateSwipeStateFilter = this.updateSwipeStateFilter.bind(this);
        // this.updateSwipeStateExplainer = this.updateSwipeStateExplainer.bind(this);
        // this.abstractSwitchUpdater = this.abstractSwitchUpdater.bind(this);
        this.hasFetchedData = false;
        this.isFetchingData = false;
        this.appProcessFilterChange = this.appProcessFilterChange.bind(this);
        this.getLocationsMusicEvents = this.getLocationsMusicEvents.bind(this);
        this.appBanner = this.appBanner.bind(this);
        this.regionFilterSwitchHTML = this.regionFilterSwitchHTML.bind(this);
        this.regionFilterHTML = this.regionFilterHTML.bind(this);
        this.eventBlocksNaarApp = this.eventBlocksNaarApp.bind(this);
    }

    componentDidMount() {
        setTimeout(() => {
            this.setState({
                openScreenHidden: true
            });
        }, 3000);
        setTimeout(() => {
            this.setState({
                openScreenMoving: true
            });
        }, 2000);
        if (!this.hasFetchedData && !this.isFetchingData)
            this.getLocationsMusicEvents();
    }

    componentDidUpdate() {}

    /**
     * voegt location objs toe aan musicEvents
     * @param {Array} [locations, musicEvents] output van promise.all
     * @returns [locations, musicEventsAndLocs]
     */
    async addLocationObjToMusicEvents([locations, musicEvents]) {
        const musicEventsAndLocs = musicEvents.map((me) => {
            const ll = me.location + "";
            const foundLoc = locations.hasOwnProperty(ll)
                ? locations[ll]
                : null;
            if (!foundLoc) {
                me.location = {
                    name: ll,
                    url: null,
                    latitude: null,
                    longitude: null,
                    city: null,
                    slug: ll,
                    region: null
                };
            } else {
                me.location = { ...foundLoc, slug: ll };
            }
            return me;
        });

        return [locations, musicEventsAndLocs];
    }

    /**
     * fetches locations.json and events-list.json
     * stores in state
     * waits for both promises to finish
     */
    async getLocationsMusicEvents() {
        this.isFetchingData = true;

        const getLocations = fetch("./locations.json", {})
            .then((response) => response.json())
            .then((locations) => {
                return locations;
            });

        const getMusicEvents = fetch("./events-list.json", {})
            .then((response) => response.json())
            .then((musicEvents) => {
                return musicEvents.filter(filterEventsDateInPast);
            });

        return await Promise.all([getLocations, getMusicEvents])
            .then(this.addLocationObjToMusicEvents)
            .then(([locations, musicEvents]) => {
                this.hasFetchedData = true;
                this.isFetchingData = false;

                this.setState({
                    locations,
                    musicEvents,
                    hasFetchedData: true,
                    canPrintRegionsFilter: true
                });

                return true;
            })
            .catch((err) => {
                this.isFetchingData = false;
                console.error(err);
            });
    }

    /**
     * manier voor eventblocks om terug te koppelen aan app hoeveel musicEventCount er nu is.
     * @param {number} currentMusicEventsLength
     */
    eventBlocksNaarApp(currentMusicEventsLength) {
        this.setState({
            hasRecievedDataFromEventBlocks: true
        });
        this.setState({
            musicEventCount: currentMusicEventsLength
        });
    }

    appProcessFilterChange(filterSettings) {
        this.setState({
            filterSettings
        });
    }

    timerHideFilter() {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
            if (
                document
                    .getElementById("region-filter-wrapper")
                    .classList.contains("region-filter--showing")
            )
                document.getElementById("region-filter-button").click();
        }, 1500);
    }

    regionFilterHTML(locatie) {
        if (locatie !== "top") return;
        if (!this.state.canPrintRegionsFilter)
            return <div className="region-filter region-filter--no-data"></div>;
        const { locations } = this.state;
        const selectedOptions = this.state.regionFilterSelectedOptions;

        const handleChange = (event) => {
            const value = Array.from(
                event.target.selectedOptions,
                (option) => option.value
            );
            this.setState({
                regionFilterSelectedOptions: value
            });
            this.timerHideFilter();
        };

        const halfNumberOfRegions = Math.ceil(
            locations._meta.regions.length / 2
        );

        return (
            <div
                id="region-filter-wrapper"
                className={`region-filter region-filter--has-data region-filter--hidden`}
            >
                <select
                    className="region-filter-select"
                    name="region-filter-select"
                    multiple
                    value={selectedOptions}
                    onChange={handleChange}
                >
                    {locations._meta.regions.map((option, index) => (
                        <option
                            className={` option-column--${index < halfNumberOfRegions ? `left` : `right`} option-column-index--${index + 1 - halfNumberOfRegions} region-filter-option`}
                            key={`region-filter-option-${index}`}
                            value={option}
                        >
                            {option}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    regionFilterSwitchHTML(locatie) {
        if (locatie !== "top") return;
        const regionFilterBtnClick = (event) => {
            event.preventDefault();
            const selWrapper = document.getElementById("region-filter-wrapper");
            if (selWrapper.classList.contains("region-filter--hidden")) {
                selWrapper.classList.add("region-filter--showing");
                selWrapper.classList.remove("region-filter--hidden");
            } else {
                selWrapper.classList.remove("region-filter--showing");
                selWrapper.classList.add("region-filter--hidden");
            }
            // const curState = this.state.showsRegionFilter;
            // this.setState({
            //     showsRegionFilter: !curState
            // });
        };
        return (
            <button
                id="region-filter-button"
                className="banner-button region-filter-button"
                onClick={regionFilterBtnClick}
            >
                Regio filter
            </button>
        );
    }

    appBanner(locatie = "top") {
        const { musicEventCount } = this.state;
        return (
            <div
                id={`app-banner-${locatie}`}
                className="app-banner cursive-font"
            >
                <h1 className="app-title">
                    {this.title}
                    <span
                        className="app-title__events-count"
                        id={`app-title__events-count-${locatie}`}
                    >
                        - {musicEventCount} concerten!
                    </span>
                </h1>
                {this.regionFilterHTML(locatie)}
                {this.regionFilterSwitchHTML(locatie)}
            </div>
        );
    }
    render() {
        const {
            openScreenHidden,
            openScreenMoving,
            filterSettings,
            locations,
            hasRecievedDataFromEventBlocks,
            hasFetchedData,
            musicEvents,
            regionFilterSelectedOptions
        } = this.state;
        return (
            <div>
                {this.appBanner("top")}
                <OpenScreen
                    hidden={openScreenHidden}
                    moving={openScreenMoving}
                />
                <div className="app">
                    <main
                        className={`app-main app-view app-view--2 ${hasRecievedDataFromEventBlocks}`}
                    >
                        <EventBlocks
                            eventBlocksNaarApp={this.eventBlocksNaarApp}
                            filterSettings={filterSettings}
                            locations={locations}
                            musicEvents={musicEvents}
                            hasFetchedData={hasFetchedData}
                            regionFilterSelectedOptions={
                                regionFilterSelectedOptions
                            }
                        />
                    </main>
                    {this.appBanner("onder")}
                </div>
            </div>
        );
    }
}

export default App;

// abstractSwitchUpdater(setStateFunc, setStateParam) {
//   setTimeout(() => {
//     window.scrollTo(0, 0);
//   }, 50);
//   setTimeout(() => {
//     setStateFunc(setStateParam);
//   }, 300);
// }

// updateSwitch(index, indexLatest, meta) {
//   this.abstractSwitchUpdater((index) => {
//     this.setState({
//       swipeState: index,
//     });
//   }, index);
// }

// updateSwipeStateExplainer() {
//   this.abstractSwitchUpdater(() => {
//     this.setState({
//       swipeState: this.state.swipeState === 1 ? 2 : 1,
//     });
//   });
// }

// updateSwipeStateFilter() {
//   this.abstractSwitchUpdater(() => {
//     this.setState({
//       swipeState: this.state.swipeState === 0 ? 1 : 0,
//     });
//   });
// }

// appTitleToExplainer() {
//   if (flicketyOptions === 0) {
//     return "";
//   }
//   return this.state.swipeState === 1 ? `Uitleg 👉` : `👈 Agenda`;
// }

// appTitleToFilter() {
//   if (this.state.swipeState === 2) {
//     return "";
//   }
//   return this.state.swipeState === 1 ? `👈 Filter` : `Agenda 👉`;
// }

import React from "react";
import Flickity from "react-flickity-component";
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
import EventBlocks from "./mods/EventBlocks.js";
import HeaderMenu from "./mods/HeaderMenu.js";
import FilterMenu from "./mods/FilterMenu.js";
import OpenScreen from "./mods/OpenScreen.js";

/**
 * Dit is app.js voordat de slider er uit gesloopt werd
 */



const flicketyOptions = {
  initialIndex: 1, // 0: filter; 1: app; 2: text;
  prevNextButtons: false,
  pageDots: false,
  freeScroll: false,
  contain: true,
  dragThreshold: 140,
};

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      openScreenRemove: false,
      openScreenHidden: false,
      names: [],
      locations: {},
      filterSettings: {
        podia: {},
        daterange: {
          lower: "2023-06-19",
          upper: "2025-12-31",
        },
      },
    };
    // this.updateSwitch = this.updateSwitch.bind(this);
    // this.updateSwipeStateFilter = this.updateSwipeStateFilter.bind(this);
    // this.updateSwipeStateExplainer = this.updateSwipeStateExplainer.bind(this);
    // this.abstractSwitchUpdater = this.abstractSwitchUpdater.bind(this);
    this.hasFetchedData = false;
    this.isFetchingData = false;
    this.appProcessFilterChange = this.appProcessFilterChange.bind(this);
    this.getScraperNamesAndLocations =
      this.getScraperNamesAndLocations.bind(this);
  }


  appProcessFilterChange(filterSettings) {
    this.setState({
      filterSettings,
    });
  }

  componentDidMount() {
    setTimeout(() => {
      this.setState({
        openScreenHidden: true,
      });
    }, 3000);
    setTimeout(() => {
      this.setState({
        openScreenMoving: true,
      });
    }, 2000);
  }

  componentDidUpdate() {
    if (!this.hasFetchedData && !this.isFetchingData)
      this.getScraperNamesAndLocations();
  }
  async getScraperNamesAndLocations() {
    this.isFetchingData = true;
    const getTimeStamps = fetch("./timestamps.json", {})
      .then((response) => {
        return response.json();
      })
      .then((timestamps) => {
        this.setState({
          names: Object.keys(timestamps).filter((key) => key !== "metalfan"),
        });
      });

    const getLocations = fetch("./locations.json", {})
      .then((response) => {
        return response.json();
      })
      .then((locations) => {
        this.setState({
          locations: locations,
        });
      });

    Promise.all([getTimeStamps, getLocations])
      .then(() => {
        this.hasFetchedData = true;
        this.isFetchingData = false;
      })
      .catch((err) => {
        this.isFetchingData = false;
        console.error(err);
      });
  }

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

  appBanner(title) {
    return (
      <div id="app-banner" className="app-banner cursive-font">
        <h1 className="app-title">{title}</h1>
        {/* <span className="app-title-right">
          <span
            onClick={this.updateSwipeStateFilter}
            className="app-title-right-button"
          >
            {this.appTitleToFilter()}
          </span>{" "}
          <span
            onClick={this.updateSwipeStateExplainer}
            className="app-title-right-button"
          >
            {this.appTitleToExplainer()}
          </span>
        </span> */}
      </div>
    );
  }

  render() {
    return (
      <div>
        {this.appBanner("Rock Agenda")}
        <OpenScreen
          hidden={this.state.openScreenHidden}
          moving={this.state.openScreenMoving}
        />
        <div className="app">
          <Flickity
            className={"app-view"} // default ''
            elementType={"div"} // default 'div'
            options={flicketyOptions} // takes flickity options {}
            disableImagesLoaded={false} // default false
            // reloadOnUpdate // default false
            // static // default false
          >
            <div className="app-view app-view--1">
              <FilterMenu
                appProcessFilterChange={this.appProcessFilterChange}
                locations={this.state.locations}
                timestampNamen={this.state.names}
              />
              <HeaderMenu timestampNamen={this.state.names} />
            </div>
            <main className="app-main app-view app-view--2">
              <EventBlocks
                filterSettings={this.state.filterSettings}
                locations={this.state.locations}
              />
            </main>
            {/* <div className="app-view app-view--3">
              
            </div> */}
          </Flickity>
          {this.appBanner("Swipe links voor filter & uitleg.")}
        </div>
      </div>
    );
  }
}

export default App;

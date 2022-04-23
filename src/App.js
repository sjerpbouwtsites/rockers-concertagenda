import React from "react";
import SwipeableViews from "react-swipeable-views";

import "./App.css";
import "./App-mobile.css";
import "./normalize.css";
import EventBlock from "./mods/EventBlock";
import HeaderMenu from "./mods/HeaderMenu";
import FilterMenu from "./mods/FilterMenu";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      swipeState: 1, // 0: filter; 1: app; 2: text;
      names: [],
      locations: {},
      filterSettings: {
        podia: {},
        daterange: {
          lower: "2022-01-01",
          upper: "2022-09-31",
        },
      },
    };
    this.updateSwitch = this.updateSwitch.bind(this);
    this.updateSwipeStateFilter = this.updateSwipeStateFilter.bind(this);
    this.updateSwipeStateExplainer = this.updateSwipeStateExplainer.bind(this);
    this.appProcessFilterChange = this.appProcessFilterChange.bind(this);
  }

  hasFetchedData = false;

  appProcessFilterChange(filterSettings) {
    this.setState({
      filterSettings,
    });
  }

  componentDidUpdate() {
    if (!this.hasFetchedData)
      getAllData()
        .then((response) => {
          return response;
        })
        .then((response) => {
          if (response?.timestamps) {
            this.setState({
              names: Object.keys(response.timestamps),
            });
          }
          if (response?.locations) {
            this.setState({
              locations: response.locations,
            });
          }
          this.hasFetchedData = true;
        })
        .catch((error) => {
          console.error(error);
        });
  }

  updateSwitch(index, indexLatest, meta) {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
    setTimeout(() => {
      this.setState({
        swipeState: index,
      });
    }, 300);
  }

  updateSwipeStateExplainer() {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
    setTimeout(() => {
      this.setState({
        swipeState: this.state.swipeState === 1 ? 2 : 1,
      });
    }, 300);
  }

  updateSwipeStateFilter() {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
    setTimeout(() => {
      this.setState({
        swipeState: this.state.swipeState === 0 ? 1 : 0,
      });
    }, 300);
  }

  appTitleToExplainer() {
    if (this.state.swipeState === 0) {
      return "";
    }
    return this.state.swipeState === 1 ? `Uitleg 👉` : `👈 Agenda`;
  }

  appTitleToFilter() {
    if (this.state.swipeState === 2) {
      return "";
    }
    return this.state.swipeState === 1 ? `👈 Filter` : `Agenda 👉`;
  }

  render() {
    const { swipeState } = this.state;
    return (
      <div>
        <div id="app-banner" className="app-banner cursive-font">
          <h1 className="app-title">Rock Agenda</h1>
          <span className="app-title-right">
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
          </span>
        </div>
        <div className="app">
          <SwipeableViews index={swipeState} onChangeIndex={this.updateSwitch}>
            <div>
              <FilterMenu
                appProcessFilterChange={this.appProcessFilterChange}
                locations={this.state.locations}
                timestampNamen={this.state.names}
              />
            </div>
            <main className="app-main">
              <EventBlock
                filterSettings={this.state.filterSettings}
                locations={this.state.locations}
              />
            </main>
            <div>
              <HeaderMenu timestampNamen={this.state.names} />
            </div>
          </SwipeableViews>
        </div>
        <div id="app-banner" className="app-banner cursive-font">
          <h1 className="app-title">Pas voor meer concerten de filters aan.</h1>
          <span className="app-title-right">
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
          </span>
        </div>
      </div>
    );
  }
}

async function getAllData() {
  const timestamps = await fetch("./timestamps.json", {})
    .then((response) => {
      return response.json();
    })
    .catch((err) => {
      console.error(err);
    });
  const locations = await fetch("./locations.json", {}).then((response) => {
    return response.json();
  });
  return {
    timestamps,
    locations,
  };
}

export default App;

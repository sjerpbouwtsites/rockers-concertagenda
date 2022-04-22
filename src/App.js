import React from "react";
import SwipeableViews from "react-swipeable-views";

import "./App.css";
import "./App-mobile.css";
import "./normalize.css";
import EventBlock from "./mods/EventBlock";
import HeaderMenu from "./mods/HeaderMenu";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      swipeState: 0, // 0: text; 1: app
      names: [],
      locations: [],
    };
    this.updateSwitch = this.updateSwitch.bind(this);
  }

  componentDidMount() {
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
      })
      .catch((error) => {
        console.error(error);
      });
  }

  updateSwitch(index, indexLatest, meta) {
    this.setState({
      swipeState: index,
    });
  }

  appTitleRight() {
    return this.state.swipeState === 0 ? `Uitleg 👉` : `Agenda 👈`;
  }

  render() {
    return (
      <div>
        <div className="app-banner">
          <h1 className="app-title">Rock Agenda</h1>
          <span className="app-title-right">{this.appTitleRight()}</span>
        </div>
        <div className="app">
          <SwipeableViews onChangeIndex={this.updateSwitch}>
            <main className="app-main">
              <EventBlock />
            </main>
            <div>
              <HeaderMenu timestampNamen={this.state.names} />
            </div>
          </SwipeableViews>
        </div>
      </div>
    );
  }
}

async function getAllData() {
  const timestamps = await fetch("./public/timestamps.json", {})
    .then((response) => {
      return response.json();
    })
    .catch((err) => {
      console.error(err);
    });
  const locations = await fetch("./public/locations.json", {}).then(
    (response) => {
      return response.json();
    }
  );
  return {
    timestamps,
    locations,
  };
}

export default App;

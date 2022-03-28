import React from "react";
import "./App.css";
import "./normalize.css";
import EventBlock from "./mods/EventBlock";
import HeaderMenu from "./mods/HeaderMenu";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      names: [],
      locations: [],
    };
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

  render() {
    return (
      <div className="app">
        <HeaderMenu timestampNamen={this.state.names} />
        <main className="app-main">
          <EventBlock />
        </main>
      </div>
    );
  }
}

async function getAllData() {
  const timestamps = await fetch("./timestamps.json", {}).then((response) => {
    return response.json();
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

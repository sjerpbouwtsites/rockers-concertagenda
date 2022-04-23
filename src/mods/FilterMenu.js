import React from "react";
import "../header-menu.css";

class FilterMenu extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      filterSettings: {
        podia: {},
        daterange: {
          lower: "2022-01-01",
          upper: "2022-06-30",
        },
      },
    };
    this.handleLocationChange = this.handleLocationChange.bind(this);
    this.fillFilter = this.fillFilter.bind(this);
    this.handleDaterangeLowerChange =
      this.handleDaterangeLowerChange.bind(this);
    this.handleDaterangeUpperChange =
      this.handleDaterangeUpperChange.bind(this);
  }

  componentDidMount() {
    setTimeout(() => {
      this.fillFilter();
    }, 1000);
  }

  handleDaterangeLowerChange(event) {
    const newFilterSettings = {
      ...this.state.filterSettings,
    };
    newFilterSettings.daterange.lower = event.target.value;
    this.setState({
      filterSettings: newFilterSettings,
    });
    this.props.appProcessFilterChange(newFilterSettings);
  }

  handleDaterangeUpperChange(event) {
    const newFilterSettings = {
      ...this.state.filterSettings,
    };
    newFilterSettings.daterange.upper = event.target.value;
    this.setState({
      filterSettings: newFilterSettings,
    });
    this.props.appProcessFilterChange(newFilterSettings);
  }

  fillFilter() {
    if (
      Object.keys(this.props.locations).length < 5 ||
      this.props.timestampNamen.length < 5
    ) {
      setTimeout(() => {
        this.fillFilter();
      }, 1000);
      return false;
    }

    const newFilterSettings = {
      ...this.state.filterSettings,
    };
    this.props.timestampNamen.forEach((locationName) => {
      const Location = this.props.locations[locationName];
      newFilterSettings.podia[locationName] = {
        checked: true,
        ...Location,
      };
    });
    this.setState({
      filterSettings: newFilterSettings,
    });
  }

  handleLocationChange(element) {
    const inputEl = element.target;
    const newFilterSettings = { ...this.state.filterSettings };
    newFilterSettings.podia[inputEl.name].checked =
      !newFilterSettings.podia[inputEl.name].checked;
    this.setState({
      filterSettings: newFilterSettings,
    });
    this.props.appProcessFilterChange(newFilterSettings);
  }

  render() {
    return (
      <header className="header-menu header-menu--filter">
        <div className="">
          <h2 className="app-title cursive-font">Filter op podium:</h2>

          <nav className="navigation-block">
            <ul className="navigation-block__list">
              {Object.entries(this.state.filterSettings.podia).map(
                ([locationSlug, filterRowData], key) => {
                  return (
                    <li className="navigation-block__list-item" key={key}>
                      <input
                        id={locationSlug}
                        type="checkbox"
                        name={locationSlug}
                        checked={filterRowData.checked}
                        onChange={this.handleLocationChange}
                      ></input>
                      <label htmlFor={locationSlug}>{filterRowData.name}</label>
                    </li>
                  );
                }
              )}
            </ul>
          </nav>

          <h2 className="app-title cursive-font">Filter op datumbereik:</h2>
          <label htmlFor="daterange-lower">
            Vanaf
            <input
              id="daterange-lower"
              name="daterange-lower"
              type="date"
              value={this.state.filterSettings.daterange.lower}
              min="2022-01-01"
              onChange={this.handleDaterangeLowerChange}
            ></input>
          </label>
          <label htmlFor="daterange-upper">
            Tot
            <input
              id="daterange-upper"
              name="daterange-upper"
              type="date"
              value={this.state.filterSettings.daterange.upper}
              min="2022-06-01"
              onChange={this.handleDaterangeUpperChange}
            ></input>
          </label>
        </div>
      </header>
    );
  }
}

async function getAllData() {
  const timestamps = await fetch("./timestamps.json", {}).then((response) => {
    return response.json();
  });
  return {
    timestamps,
  };
}

export default FilterMenu;

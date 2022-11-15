import React from "react";
import "../open-screen.css";

class OpenScreen extends React.Component {
  constructor(props) {
    super(props);
  }


  classNameTop() {
    return `open-screen ${this.props.hidden ? 'open-screen__hidden' : ''} ${this.props.moving ? 'open-screen__moving' : ''}`
  }

  render() {
    if (this.props.hidden) return "";
    return (
      <div className={this.classNameTop()}>
        <div className="open-screen__centre">
          <h1 className="open-screen__title sans-serif-font">
            Welkom op<br></br>Rock Agenda
          </h1>
          <p className="open-screen__text serif-font">
            Filters links<br></br>
            Uitleg rechts
          </p>
          <p className="open-screen__text serif-font pink-color">🖤 Sjerp</p>
        </div>
      </div>
    );
  }
}

export default OpenScreen;

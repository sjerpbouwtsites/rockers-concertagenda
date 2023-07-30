import React from 'react';

class OpenScreen extends React.Component {
  constructor(props) {
    super(props);
  }

  classNameTop() {
    return `open-screen ${this.props.hidden ? 'open-screen__hidden' : ''} ${
      this.props.moving ? 'open-screen__moving' : ''
    }`;
  }

  render() {
    if (this.props.hidden) return '';
    return (
      <div className={this.classNameTop()}>
        <div className="open-screen__centre">
          <h1 className="open-screen__title sans-serif-font">
            Welkom op
            <br />
            Rock Agenda
          </h1>
          <p className="open-screen__text serif-font">
            Klik events
            <br />
            voor meer.
          </p>
          <p className="open-screen__text serif-font">
            App in
            <br />
            {' '}
            aanbouw!
          </p>
          <p className="open-screen__text serif-font pink-color">🖤 Sjerp</p>
        </div>
      </div>
    );
  }
}

export default OpenScreen;

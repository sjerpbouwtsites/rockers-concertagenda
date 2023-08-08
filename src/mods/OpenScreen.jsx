import React from 'react';

class OpenScreen extends React.Component {
  classNameTop() {
    const { hidden, moving } = this.props;
    return `open-screen ${hidden ? 'open-screen__hidden' : ''} ${
      moving ? 'open-screen__moving' : ''
    }`;
  }

  render() {
    const { hidden } = this.props;
    if (hidden) return '';
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

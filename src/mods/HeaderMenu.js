import React from "react";

class HeaderMenu extends React.Component {
  constructor(props) {
    super(props);
    this.state = { names: [] };
  }

  componentDidMount() {}

  render() {
    return (
      <header className="header-menu">
        <div className="header-menu__sticky">
          <p className="app-text">
            Deze app verzamelt &lsquo;alle&rsquo; metal, punk, hardrock etc.
            concerten, van een groeiende lijst concertzalen.
          </p>

          <h2 className="app-title cursive-font">Over mij</h2>
          <p className="app-text">
            Ik ben Sjerp van Wouden, uit Mokum, leuk dat je me app gebruikt!
            <br></br> Ik ben een socialistische vakbondsman en ben organiser bij
            de{" "}
            <a
              className="app-link-in-text"
              href="https://radicalriders.nl"
              target="_blank"
            >
              Radical Riders
            </a>{" "}
            en{" "}
            <a
              className="app-link-in-text"
              href="https://vloerwerk.org"
              target="_blank"
            >
              Solidariteitsnetwerk Vloerwerk
            </a>
            .<br></br>Van al dat organisen heb ik soms m&lsquo;n buik vol en dan
            draai ik vaak een app in elkaar.<br></br>
            Al jaren vind ik &lsquo;t veel te moeilijk om een beetje bij te
            houden waar nu welk optreden is. Nu na Corona wil ik wel ieder
            concert dat ik kan bijwonen.... toch?! Dus bedacht ik deze app.
          </p>
          <h2 className="app-title cursive-font">Momenteel gescrapede zalen</h2>
          <p className="app-text">
            Volgende zalen worden één voor één uitgelezen en verwerkt. De oude
            metalfan.nl agenda zit er ook in, voorzover zalen niet direct gedekt
            worden.
          </p>
          <nav className="navigation-block">
            <ul className="navigation-block__list">
              {this.props.timestampNamen.map((nameOfScrape, key) => {
                return (
                  <li className="navigation-block__list-item" key={key}>
                    {nameOfScrape}
                  </li>
                );
              })}
            </ul>
          </nav>
          <h2 className="app-title cursive-font">Draag bij</h2>
          <p className="app-text">
            <strong>Doneer.</strong> Ook gratis apps kosten geld en tijd.
            Doneren kan en wordt op prijs gesteld! Dat kan naar
            NL31INGB0006886074. Als je wilt dat jouw concertzaal óók in de app
            komt, dan is mij omkopen de tip van de week.
          </p>
          <p className="app-text">
            <strong>Bouw mee.</strong> Deze app is{" "}
            <a
              className="app-link-in-text"
              href="https://github.com/sjerpbouwtsites/rockers-concertagenda"
              target="_blank"
            >
              open source
            </a>
            . Draag code bij, meld problemen of doe suggesties. De app is
            gebouwd in redelijk recht toe recht aan Javascript en React. Het
            enige wat geavanceerde is de multi-threading in de backend. Het is
            voor de vuist weg gebouwd dus wellicht wat rommelig ;) Je kan de app
            thuis installeren vanaf github en draaien.
          </p>
          <h2 className="app-title cursive-font">Contact</h2>
          <p className="app-text">
            <a
              className="app-link-in-text"
              href="mailto:dev@sjerpbouwtsites.nl"
            >
              Mail mij
            </a>
            .
          </p>
        </div>
      </header>
    );
  }
}

export default HeaderMenu;

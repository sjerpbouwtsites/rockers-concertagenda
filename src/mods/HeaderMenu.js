import React from "react";
import "../header-menu.css";

class HeaderMenu extends React.Component {
  state = { names: [] };
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    getAllData()
      .then((response) => {
        return response.timestamps;
      })
      .then((timestamps) => {
        if (timestamps) {
          this.setState({
            names: Object.keys(timestamps),
          });
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }

  render() {
    const names = this.state.names;

    return (
      <header className="header-menu">
        <div className="header-menu__sticky">
          <p className="app-text">
            Deze app verzamelt 'alle' metal, punk, hardrock etc. concerten.
            <br></br>
            <br></br>
            Data komt van de varia concertzalen. Die worden stuk voor stuk
            uitgelezen en verwerkt. De oude metalfan.nl agenda zit er ook in,
            voorzover zalen niet direct gedekt worden.
          </p>
          <nav className="navigation-block">
            <ul className="navigation-block__list">
              {names.map((nameOfScrape, key) => {
                return (
                  <li className="navigation-block__list-item" key={key}>
                    {nameOfScrape}
                  </li>
                );
              })}
            </ul>
          </nav>
          <h2 className="app-title">Over mij</h2>
          <p className="app-text">
            Ik was ff klaar met het organiseren van de klassestrijd bij de{" "}
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
              Vloerwerk
            </a>{" "}
            en had zin in iets anders. En me vorige viral app is al weer ruim
            een jaar geleden. Na Corona ga ik geen concert meer missen. Maar
            waarom is er nog geen goed overzicht?!
            <br></br>
            Ik ben Sjerp van Wouden, uit Mokum. Veel plezier met me app 🍻
          </p>
          <h2 className="app-title">Draag bij</h2>
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
          <h2 className="app-title">Contact</h2>
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

async function getAllData() {
  const timestamps = await fetch("./timestamps.json", {}).then((response) => {
    return response.json();
  });
  return {
    timestamps,
  };
}

export default HeaderMenu;

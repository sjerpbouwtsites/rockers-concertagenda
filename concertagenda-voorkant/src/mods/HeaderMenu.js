import React from "react";

class HeaderMenu extends React.Component {
  constructor(props) {
    super(props);
    // getAllData()
    //   .then((response) => {
    //     return response.timestamps;
    //   })
    //   .then((timestamps) => {
    //     if (timestamps) {
    //       this.setState({
    //         names: Object.keys(timestamps),
    //       });
    //     }
    //   })
    // .catch((error) => {
    //   console.error(error);
    // });
  }
  state = { names: ["je moedr"] };

  render() {
    const names = this.state.names;
    return (
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
    );
  }
}

// async function getAllData() {
//   const timestamps = await fetch("./timestamps.json", {}).then((response) => {
//     return response.json();
//   });
//   return {
//     timestamps,
//   };
// }

export default HeaderMenu;

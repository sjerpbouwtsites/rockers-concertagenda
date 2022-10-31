export default class MonitorField {
  name = null;
  target = null; // element-id
  type = null; // rol of tabel
  data = [];
  constructor(name, target, type) {
    this.name = name;
    this.target = target;
    this.type = type;
  }
  get mainFieldName() {
    return `monitorfield-main-${this.name}`;
  }
  get initialHTML() {
    return `
    <section 
      id='monitorfield-${this.name}' 
      class='monitorfield monitorfield--${this.type} monitorfield--${this.name}'>
      <header class='monitorfield__header'>
        <h2 class='monitorfield__title'>${this.name}</h2>
      </header>
      <div id='${this.mainFieldName}' class='monitorfield__main'>
      </div>
    </section>`;
  }
  initialize() {
    const targetEl = document.getElementById(this.target);
    targetEl.innerHTML = this.initialHTML;
  }
  linebreaksNaarBR(tekst) {
    return JSON.stringify(tekst, null, 2)
      .replace(/["':]/g, "")
      .replace(/\\n/g, "<br>");
  }
  objectNaarTekst(objectTeVeranderen) {
    let tt = { ...objectTeVeranderen };
    delete tt.workerData;
    return JSON.stringify(tt, null, 2)
      .replace(/[{]/g, "<br>")
      .replace(/[}]/g, "");
  }
  updateConsole(updateData) {
    this.data.splice(2);
    this.update(updateData);
  }
  update(updateData) {
    this.data.unshift(updateData);
    const mainFieldEl = document.getElementById(this.mainFieldName);
    switch (this.type) {
      case "roll":
        mainFieldEl.innerHTML = this.rollUpdatedHTML;
        break;
      case "table":
        mainFieldEl.innerHTML = this.tableUpdatedHTML;
        break;
      case "expanded":
        mainFieldEl.innerHTML = this.expandedUpdatedHTML;
        break;
      default:
        mainFieldEl.innerHTML = this.rollUpdatedHTML;
        break;
    }
  }
  updateTable(updateData) {
    this.data = [];
    this.update(updateData);
  }
  get rollUpdatedHTML() {
    const listItems = this.data
      .map((rollRow) => {
        let t =
          rollRow.messageData?.content?.text ??
          rollRow.messageData?.content?.tekst ??
          rollRow.messageData?.tekst ??
          rollRow.messageData?.text ??
          null;
        if (t) {
          t = this.linebreaksNaarBR(t);
        } else {
          console.log("geen tekst gevonden", rollRow);
          t =
            (rollRow.messageData?.content ?? rollRow.messageData) instanceof
            Object
              ? this.objectNaarTekst(
                  rollRow.messageData?.content ?? rollRow.messageData
                )
              : String(
                  rollRow.messageData?.content ??
                    rollRow.messageData.text ??
                    rollRow.messageData
                );
        }

        return `<li class='monitorfield__list-item'>
        <span class='monitorfield__list-item-left'>${
          rollRow.messageData?.workerName ?? rollRow.messageData?.title ?? ""
        }</span>
        <span class='monitorfield__list-item-right'>${t}</span>
      </li>`;
      })
      .join("");
    return `
    <ul class='monitorfield__list'>${listItems}</ul>`;
  }
  get expandedUpdatedHTML() {
    const listItems = this.data
      .map((rollRow) => {
        const titleText = `${rollRow.messageData?.title ?? ""}${
          rollRow.messageData?.workerName ?? ""
        }`;
        let hoofdPrintTekst =
          (rollRow.messageData?.content ?? rollRow.messageData) instanceof
          Object
            ? this.objectNaarTekst(
                rollRow.messageData?.content ?? rollRow.messageData
              )
            : String(rollRow.messageData?.content ?? rollRow.messageData);
        return `<li class='monitorfield__list-item'>
        <span class='monitorfield__list-item-left'>${titleText}</span>
        <span class='monitorfield__list-item-right'><pre>${hoofdPrintTekst}</pre></span>
      </li>`;
      })
      .join("");
    return ` <ul class='monitorfield__list'>${listItems}</ul>`;
  }
  get tableUpdatedHTML() {
    console.log(this.data);
    const workersPerFamily = {};
    Object.entries(this.data.workers).forEach(([workerName, workerData]) => {
      const family = workerName.split("-")[0];
      const workerIndex = workerName.split("-")[1];
      if (!workersPerFamily[family]) {
        workersPerFamily[family] = [];
      }
      workersPerFamily[family][workerIndex] = workerData;
    });

    const tableHead = `
    <thead>
    <tr>
    <th>Die gekke tabel shit!</th>
    </tr>
    </thead>
    `;
    const tableRowsFirstCellsTextcontent = Object.keys(workersPerFamily);
    const tableBodyRows = workersPerFamily
      .map((workerFamily, index) => {
        return `
      <tr>
        <th>${tableRowsFirstCellsTextcontent[index]}</th>
        ${workerFamily.workers
          .map((worker) => {
            let tdClass = "";
            tdClass += "worker-status--" + worker.status;
            tdClass +=
              "worker-errors--" + worker.errors.length ? "has-errors" : "none";

            errorsHTML = !worker.errors.length
              ? ""
              : `<ol class='worker-cell-inner--errors'>
              ${worker.errors
                .map((error) => `<li>${error.message}</li>`)
                .join("")}
            </ol>`;

            return `<td class='${tdClass}'>
            <span class='worker-cell-inner--status'>${worker.status}</span>
            <span class='worker-cell-inner--todo'>${worker.status} todo</span>
            ${errorsHTML}
          </td>`;
          })
          .join("")}
      </tr>
      `;
      })
      .join("");

    return `
      <table class='app-overview-table'>
        ${tableHead}
        <tbody>${tableBodyRows}</tbody>
      </table>`;
  }
}
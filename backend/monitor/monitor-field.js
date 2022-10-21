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
    return `monitorfield-main-${this.name}`
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
    </section>`
  }
  initialize() {
    const targetEl = document.getElementById(this.target);
    targetEl.innerHTML = this.initialHTML;
  }
  linebreaksNaarBR(tekst) {
    return tekst.replace(/[\n\r]/g, '<br>');
  }
  updateConsole(updateData) {
    this.data.splice(2);
    this.update(updateData);
  }
  update(updateData) {
    this.data.unshift(updateData);
    const mainFieldEl = document.getElementById(this.mainFieldName)
    switch (this.type) {
      case 'roll':
        mainFieldEl.innerHTML = this.rollUpdatedHTML
        break;
      case 'table':
        mainFieldEl.innerHTML = this.tableUpdatedHTML
        break;
      case 'expanded':
        mainFieldEl.innerHTML = this.expandedUpdatedHTML
        break;
      default:
        mainFieldEl.innerHTML = this.rollUpdatedHTML
        break;
    }
  }
  get rollUpdatedHTML() {

    const listItems = this.data.map(rollRow => {
      return `<li class='monitorfield__list-item'>
        <span class='monitorfield__list-item-left'>${rollRow.messageData?.workerName ?? rollRow.messageData?.title ?? ''}</span>
        <span class='monitorfield__list-item-right'>${this.linebreaksNaarBR(rollRow.messageData.text)}</span>
      </li>`
    }).join('');
    return `
    <ul class='monitorfield__list'>${listItems}</ul>`;
  }
  get expandedUpdatedHTML() {

    const listItems = this.data.map(rollRow => {
      const titleText = `${rollRow.messageData?.title} ${rollRow.messageData?.worker} ${rollRow.messageData?.workerName}`;
      return `<li class='monitorfield__list-item'>
        <span class='monitorfield__list-item-left'>${titleText}</span>
        <span class='monitorfield__list-item-right'>${this.linebreaksNaarBR(rollRow.messageData.text)}</span>
      </li>`
    }).join('');
    return ` <ul class='monitorfield__list'>${listItems}</ul>`;
  }
  get tableUpdatedHTML() {
    return 'gdfgdfgfd';
  }

}
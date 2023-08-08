import prettyPrint from '../mods/pretty-print.js';

export default class MonitorField {
  constructor(name, target, type) {
    this.name = name;
    this.target = target;
    this.type = type;
    this.data = [];
    if (this.type === 'table') {
      this.data = {};
    }
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
    return prettyPrint(tekst);
  }

  objectNaarTekst(objectTeVeranderen) {
    let tt = { ...objectTeVeranderen };
    delete tt.workerData;
    if (tt.debug) {
      tt = tt.debug;
    }

    let pretty = prettyPrint(tt, {
      indent: '  ',
      singleQuotes: false,
      // transform: (obj, prop, originalResult) => {
      //   if (prop === 'url') {
      //     return 'https://'+originalResult
      //   }

      //   return originalResult;
      // }
    });

    const langeTekenMatches = pretty.match(/([\w.,\s]{50,5000})/g);
    if (Array.isArray(langeTekenMatches) && langeTekenMatches.length > 1) {
      langeTekenMatches.forEach((langeTeken) => {
        const kortereTekenReeds = langeTeken.substring(0, 50);
        pretty = pretty.replace(langeTeken, `<span class='ingekort-lange-tekst' data-meer-tekst='${langeTeken}'>${kortereTekenReeds}</span>`);
      });
    }
    return pretty;
  }

  compareWorkers(workerA, workerB) {
    const wai = Number(workerA.workerNamedIndex);
    const wbi = Number(workerB.workerNamedIndex);
    if (wai < wbi) {
      return -1;
    }
    if (wbi > wai) {
      return 1;
    }
    return 0;
  }

  updateConsole(updateData) {
    this.data.splice(100);
    this.update(updateData);
  }

  update(updateData) {
    this.data.splice(100);
    this.data.unshift(updateData);
    const mainFieldEl = document.getElementById(this.mainFieldName);
    switch (this.type) {
      case 'roll':
        mainFieldEl.innerHTML = this.rollUpdatedHTML;
        break;
      case 'table':
        break;
      case 'expanded':
        mainFieldEl.innerHTML = this.expandedUpdatedHTML;
        break;
      default:
        mainFieldEl.innerHTML = this.rollUpdatedHTML;
        break;
    }
  }

  updateError(updateData) {
    this.data.unshift(updateData);
    document.getElementById(this.mainFieldName).innerHTML = this.errorUpdateHTML;
  }

  updateTable(updateData) {
    this.data = {
      ...this.data,
      ...updateData,
    };

    document.getElementById(this.mainFieldName).innerHTML = this.tableUpdatedHTML;
    document.querySelector(
      '#monitorfield-AppOverview .monitorfield__title',
    ).innerHTML = `AppOverview - CPU vrij: ${Math.round(this.data.CPUFree * 100) / 100
      }%`;
  }

  get rollUpdatedHTML() {
    const listItems = this.data
      .map((rollRow) => {
        let t = rollRow.messageData?.content?.text
          ?? rollRow.messageData?.content?.tekst
          ?? rollRow.messageData?.tekst
          ?? rollRow.messageData?.text
          ?? rollRow.messageData?.content;
        null;
        if (t) {
          t = this.linebreaksNaarBR(t);
        } else {
          console.log('geen tekst gevonden', rollRow);
          t = (rollRow.messageData?.content ?? rollRow.messageData)
            instanceof Object
            ? this.objectNaarTekst(
              rollRow.messageData?.content ?? rollRow.messageData,
            )
            : String(
              rollRow.messageData?.content
              ?? rollRow.messageData.text
              ?? rollRow.messageData,
            );
        }

        return `<li class='monitorfield__list-item'>
        <span class='monitorfield__list-item-left'>${rollRow.messageData?.workerName ?? rollRow.messageData?.title ?? ''
          }</span>
        <span class='monitorfield__list-item-right'>${t}</span>
      </li>`;
      })
      .join('');
    return `
    <ul class='monitorfield__list monitorfield__list--roll'>${listItems}</ul>`;
  }

  get errorUpdateHTML() {
    const errorsPerWorkerCounter = {};
    console.log(this.data)
    const listItems = this.data
      .map((rollRow) => {
        try {
          const titleText = `${rollRow.messageData?.title ?? ''}${rollRow.messageData?.workerName ?? ''
            }`;

    

          const bewerkteFoutTekst = rollRow.messageData.content.text
            .split(/[\r\n]/)
            .filter(a => a)
            .map((errorTextRow, index) => {
              if (index < 1) return '';
              if (errorTextRow.includes('node:internal')) return '';
              let t = errorTextRow;
              if (errorTextRow.includes('file://')) {
                console.log(errorTextRow)
                let volleFileNaam;
                try {
                  volleFileNaam = errorTextRow.match(/(file.*)\)/)[1];
                } catch (error) {
                  volleFileNaam = errorTextRow.match(/(file.*)/)[1];
                  console.log(errorTextRow)
                  console.error(new Error('SCHEIT'));
                }

                console.log(errorTextRow)

                const fileLink = errorTextRow
                  .split('concertagenda')[1]
                  .replace(')', '');
                const fileNaamIngekort = fileLink
                  .split('backend')[1]
                  .substring(1, fileLink.length - 1);
                const fileLinkWSL = `vscode://vscode-remote/wsl+Ubuntu-22.04/home/sjerp/dev/apache/concertagenda${fileLink}`;
                t = t.replace(
                  volleFileNaam,
                  `<a class='monitorfield__filelink' href='${fileLinkWSL}'>${fileNaamIngekort}</a>`,
                );
                t = t.replace(/[()]/g, '');
              }

              t = t.replace(/\sError: /, '');
              t = `<span class='monitorfield__error-line'>${t}</span>`;
              return `${t}\r`;
            })
            .join('');

          const hoofdPrintTekst = ` 
          <div class='monitorfield__errortext'>${bewerkteFoutTekst}</div>
            `;

          let currentErrorsForThisWorkerCount = 0;
          if (!errorsPerWorkerCounter[errorsPerWorkerCounter]) {
            errorsPerWorkerCounter[errorsPerWorkerCounter] = 0;
          } else {
            errorsPerWorkerCounter[errorsPerWorkerCounter] = errorsPerWorkerCounter[errorsPerWorkerCounter] + 1;
            currentErrorsForThisWorkerCount = errorsPerWorkerCounter[errorsPerWorkerCounter];
          }

          return `<li class='monitorfield__list-item' id='error-ref-${rollRow.messageData?.workerName}-${currentErrorsForThisWorkerCount}'>
            <header class='monitorfield__error-header'>
              <span class='monitorfield__error-workername'>${titleText}</span>
              <span class='monitorfield__error-remarks'>${rollRow.messageData.content.remarks}</span>
            </header>
            
            <div class='monitorfield__list-item-right'>${hoofdPrintTekst}</div>
          </li>`;
        } catch (error) {

          let currentErrorsForThisWorkerCount = 0;
          if (!errorsPerWorkerCounter[errorsPerWorkerCounter]) {
            errorsPerWorkerCounter[errorsPerWorkerCounter] = 0;
          } else {
            errorsPerWorkerCounter[errorsPerWorkerCounter] = errorsPerWorkerCounter[errorsPerWorkerCounter] + 1;
            currentErrorsForThisWorkerCount = errorsPerWorkerCounter[errorsPerWorkerCounter];
          }

          return `<li class='monitorfield__list-item' id='error-ref-${rollRow.messageData?.workerName}-${currentErrorsForThisWorkerCount}'>
        <header class='monitorfield__error-header'>
          <span class='monitorfield__error-workername'>niet standaard error</span>
          <span class='monitorfield__error-remarks'>${rollRow?.messageData?.content?.remarks}</span>
        </header>
        
        <div class='monitorfield__list-item-right'>${rollRow.toString()}</div>
      </li>`;
        }

      })
      .join('');
    return ` <ul class='monitorfield__list monitorfield__list--error'>${listItems}</ul>`;
  }

  get expandedUpdatedHTML() {
    const listItems = this.data
      .map((rollRow) => {
        const titleText = `${rollRow.messageData?.content?.title ?? rollRow.messageData?.title ?? ''}${rollRow.messageData?.workerName ?? ''
          }`;
        delete rollRow.messageData?.content?.title;
        delete rollRow.messageData?.title;

        const hoofdPrintTekst = (rollRow.messageData?.content ?? rollRow.messageData)
          instanceof Object
          ? this.objectNaarTekst(
            rollRow.messageData?.content ?? rollRow.messageData,
          )
          : String(rollRow.messageData?.content ?? rollRow.messageData);

        // vervang losse links met ankers
        // const metAnkers = hoofdPrintTekst.replaceAll(/[^=][^"'](https:.*)/g, "<a href='$1' target='_blank'>link</a>");
        const metAnkers = hoofdPrintTekst;
        // const zonderAanhalingstekens = metAnkers.replace(/"/g,'');
        const zonderAanhalingstekens = metAnkers;

        return `<li class='monitorfield__list-item'>
        <span class='monitorfield__list-item-left'>${titleText}</span>
        <div class='monitorfield__list-item-right'>${zonderAanhalingstekens}</div>
      </li>`;
      })
      .join('');
    return ` <ul class='monitorfield__list monitorfield__list--expanded'>${listItems}</ul>`;
  }

  get tableUpdatedHTML() {
    const workersPerFamily = {};

    Object.entries(this.data.workers).forEach(([workerName, workerData]) => {
      const family = workerName.split('-')[0];
      const workerIndex = workerName.split('-')[1];
      if (!workersPerFamily[family]) {
        workersPerFamily[family] = [];
      }
      workersPerFamily[family][workerIndex] = {
        ...workerData,
        workerNamedIndex: workerIndex,
        amountOfEvents: this.data[`amountOfEvents-${family}-${workerIndex}`],
      };
    });

    let workerNumberedHeads = '';
    for (let i = 0; i < 6; i++) {
      workerNumberedHeads += `<th class='tablehead tablehead--number'>
        <span class='tablehead-span'>${i}</span>
      </th>`;
    }

    const tableHead = `
    <thead>
    <!--<tr>-->
    <th>Workers<span class='kutspacer'></span></th>${workerNumberedHeads}
    <!--</tr>-->
    </thead>
    `;

    const tableRowsFirstCellsTextcontent = Object.keys(workersPerFamily);

    const tableBodyRows = Object.values(workersPerFamily)
      .map((workerFamily, index) => {
        const workerFamilyNamesCharsets = [];
        tableRowsFirstCellsTextcontent[index].split('').forEach((char, index) => {
          const charsetIndex = Math.floor(index / 6);
          if (!workerFamilyNamesCharsets[charsetIndex]) {
            workerFamilyNamesCharsets[charsetIndex] = '';
          }
          workerFamilyNamesCharsets[charsetIndex] = workerFamilyNamesCharsets[charsetIndex] + char;
        });

        const sortedFamily = workerFamily.sort(this.compareWorkers);
        return `
      <tr>
        <th>${workerFamilyNamesCharsets.join('<br>')}<span class='kutspacer'></span></th>
        ${sortedFamily
            .map((worker) => {
              let tdClass = 'worker-data-cell ';
              tdClass += `worker-status--${worker.status}`;
              tdClass
                += ` worker-errors--${worker.errors.length ? 'has-errors' : 'none'}`;

              const errorsHTML = !worker.errors.length
                ? ''
                : `<ol class='worker-cell-inner--errors'>
              ${worker.errors
                  .map(
                    (error, index) => {
                      const errorLevel = error?.content?.errorLevel ?? 'notice';
                      const emoji = errorLevel === 'notice'
                        ? '🤦‍♂️'
                        : errorLevel === 'close-thread'
                          ? '🫣'
                          : errorLevel === 'close-app'
                            ? '💥'
                            : '❓';

                      return `<li class='worker-cell-inner-error-item worker-cell-inner-error-item--${errorLevel}'><a class='error-link error-link--${errorLevel}' href='#error-ref-${worker.name}-${index}'>${emoji}</a></li>`;
                    },
                  )
                  .join('')}
            </ol>`;
              const statusHTML = `<td class='${tdClass}' title='${worker.workerNamedIndex}'>`;
              const numberHTML = Object.prototype.hasOwnProperty.call(this.data, `amountOfEvents-${worker.name}`)
                ? `<span class='worker-cell-inner worker-cell-inner--done'>${this.data[`amountOfEvents-${worker.name}`]}</span>`
                : `<span class='worker-cell-inner worker-cell-inner--todo'>${worker.todo}</span>`;

              return `${statusHTML + numberHTML + errorsHTML}</td>`;
              // TODO vscode link naar JSON bestand in event-lists
            })
            .join('')}
      </tr>
      `;
      })
      .join('');

    return `
      <table class='app-overview-table'>
        ${tableHead}
        <tbody>${tableBodyRows}</tbody>
      </table>`;
  }
}

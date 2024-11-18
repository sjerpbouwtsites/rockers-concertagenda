/* eslint-disable no-undef */
/* eslint-disable no-alert */

async function laadStore() {
    return fetch("../store/allowed-artists.json")
        .catch((err) => {
            console.error(err);
        })
        .then((r) => r.json());
}

async function jsonNaarTabelData() {
    const jsonData = await laadStore();
    const tabelData = Object.entries(jsonData).map(([key, values]) => {
        const isSlug = values[0];
        const spotifyId = values[1];
        const metalEnc = null;
        const genres = values[3].join("%%%");
        const komendEvent = values[4];
        const aanpassingsDatum = values[5];
        return [
            key,
            isSlug,
            spotifyId,
            metalEnc,
            genres,
            komendEvent,
            aanpassingsDatum
        ];
    });
    //   tabelData.unshift(['Key', 'Is Slug', 'Spotify ID', 'BS', 'Genres', 'Komend Event', 'Aanpassingsdatum']);
    return tabelData;
}

function exportData() {
    const tabelAlsObject = {};
    Array.from(
        document.querySelectorAll("tbody .ht__row_odd, tbody .ht__row_even")
    )
        .filter((rij) => !rij.classList.contains("maak-rood-gooi-weg"))
        .map((row) =>
            Array.from(row.querySelectorAll("td")).map((cel) => {
                const t = cel.textContent;
                if (t.includes("%%%")) {
                    return t.split("%%%");
                }
                return t;
            })
        )
        .forEach((rij) => {
            const key = rij.shift();
            tabelAlsObject[key] = rij;
        });
    const dataPrintTextArea = document.getElementById("data-print");
    dataPrintTextArea.innerHTML = JSON.stringify(tabelAlsObject);
    dataPrintTextArea.classList.add("geprint");

    dataPrintTextArea.select();

    navigator.clipboard.writeText(dataPrintTextArea.value);

    setTimeout(() => {
        dataPrintTextArea.innerHTML = "zit in clipboard";
    }, 500);
    setTimeout(() => {
        dataPrintTextArea.classList.remove("geprint");
    }, 1000);
}

function initTabel(data) {
    const appContainer = document.querySelector("#app");
    const hot = new Handsontable(appContainer, {
        data,
        colHeaders: [
            "Key",
            "Is Slug",
            "Spotify ID",
            "BS",
            "Genres",
            "Komend Event",
            "Aanpassingsdatum"
        ],
        multiColumnSorting: true,
        rowHeaders: true,
        height: "auto",
        colWidths: [250, 30, 60, 10, 250, 80, 80],
        width: "auto",
        autoWrapRow: true,
        autoWrapCol: true,
        licenseKey: "non-commercial-and-evaluation", // for non-commercial use only
        allowInsertRow: true,
        syncLimit: 5000
    });
    return hot;
}

function zetVerwijderKnoppen() {
    document.querySelectorAll("tbody th").forEach((tableHeadCell) => {
        const index = tableHeadCell.parentNode.getAttribute("aria-rowindex");
        const nieuweKnop = document.createElement("button");
        nieuweKnop.setAttribute("data-index", index);
        nieuweKnop.innerHTML = "🚽";
        nieuweKnop.className = "verwijder-rij-knop";
        tableHeadCell.querySelector(".relative").appendChild(nieuweKnop);
    });
}

function zetVerwijderEventListener(hot) {
    document.body.addEventListener("click", (e) => {
        if (!e.target.classList.contains("verwijder-rij-knop")) return;
        e.preventDefault();
        const index = e.target.getAttribute("data-index");
        const rij = document.querySelector(`[aria-rowindex='${index}']`);
        rij.classList.toggle("maak-rood-gooi-weg");
    });
}

function naInitTabel(hot) {
    zetVerwijderKnoppen();
    zetVerwijderEventListener(hot);

    // hot
}

function zetExportDataEventHandler() {
    document.getElementById("export-data").addEventListener("click", (e) => {
        e.preventDefault();
        exportData();
    });
}

async function initInterface() {
    const dd = await jsonNaarTabelData();
    const hot = initTabel(dd);

    naInitTabel(hot);

    zetExportDataEventHandler();
}

initInterface();

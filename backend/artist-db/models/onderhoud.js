import fs from "fs";

/**
 * Gaat door allowed-artists.json, allowed-events.json, refused.json, unclear-artists.json
 * in ${fsDirections.artistDBstore} en sorteert de JSON op lengte van de keys
 */
function sorteerStoreOpLengteVanKeys(fsDirections) {
    const storeFiles = [
        "allowed-artists.json",
        "allowed-events.json",
        "refused.json",
        "unclear-artists.json"
    ];
    storeFiles.forEach((store) => {
        const file = JSON.parse(
            fs.readFileSync(`${fsDirections.artistDBstore}/${store}`, "utf-8")
        );
        const fileKeys = Object.keys(file);
        const sortedKeys = fileKeys.sort((a, b) => {
            if (a.length > b.length) return -1;
            if (b.length > a.length) return 1;
            return 0;
        });
        const nieuweFile = {};
        sortedKeys.forEach((key) => {
            nieuweFile[key] = file[key];
        });
        fs.writeFileSync(
            `${fsDirections.artistDBstore}/${store}`,
            JSON.stringify(nieuweFile, null, 2),
            "utf-8"
        );
    });
}

/**
 * Alle allowed events met een eventDate verder dan een maand in het verleden weg.
 */
function gooiOudeEventsWegUitAllowedEvents(fsDirections) {
    const vorigeMaand = new Date();
    vorigeMaand.setMonth(vorigeMaand.getMonth() - 2);
    const v = vorigeMaand.toISOString();
    const korteVorigeMaand = Number(
        v.substring(2, 4) + v.substring(5, 7) + v.substring(8, 10)
    );

    const allowedEvents = JSON.parse(
        fs.readFileSync(
            `${fsDirections.artistDBstore}/allowed-events.json`,
            "utf-8"
        )
    );
    const relevanteEvents = Object.entries(allowedEvents).filter(
        ([key, ev]) => {
            if (!ev[1]) return false;
            const eventDatum = Number(ev[1]);
            return eventDatum > korteVorigeMaand;
        }
    );

    const relevanteFile = {};
    relevanteEvents.forEach(([key, event]) => {
        relevanteFile[key] = event;
    });

    fs.writeFileSync(
        `${fsDirections.artistDBstore}/allowed-events.json`,
        JSON.stringify(relevanteFile, null, 2),
        "utf-8"
    );
}

/**
 * Alle refused events met
 *  1. een key langer dan 16 tekens
 *  2. een eventDate verder dan een maand in het verleden of
 *  3. een aanmaakDatum verder dan een jaar in het verleden weg
 */
function gooiOudeRefusedWeg(fsDirections) {
    const vorigeMaand = new Date();
    vorigeMaand.setMonth(vorigeMaand.getMonth() - 2);
    const v = vorigeMaand.toISOString();
    const korteVorigeMaand = Number(
        v.substring(2, 4) + v.substring(5, 7) + v.substring(8, 10)
    );

    const vorigJaar = new Date();
    vorigJaar.setMonth(vorigeMaand.getMonth() - 13);
    const d = vorigJaar.toISOString();
    const korteVorigJaar = Number(
        d.substring(2, 4) + d.substring(5, 7) + d.substring(8, 10)
    );

    const refusedEvents = JSON.parse(
        fs.readFileSync(`${fsDirections.artistDBstore}/refused.json`, "utf-8")
    );
    const relevanteEvents = Object.entries(refusedEvents).filter(
        ([key, ev]) => {
            if (key.length < 17) return true;

            const eventLength = ev.length;
            const eventDateIndex = eventLength - 2;
            const recordDateIndex = eventLength - 1;

            let eventDate = Number(ev[eventDateIndex]);
            let recordAangemaakt = Number(ev[recordDateIndex]);

            if (Number.isNaN(eventDate)) {
                eventDate = 0;
            }
            if (Number.isNaN(recordAangemaakt)) {
                recordAangemaakt = 0;
            }
            if (!eventDate && !recordAangemaakt) return false;

            if (eventDate < korteVorigeMaand) return false;
            if (recordAangemaakt < korteVorigJaar) return false;

            return true;
        }
    );

    const relevanteFile = {};
    relevanteEvents.forEach(([key, event]) => {
        relevanteFile[key] = event;
    });

    fs.writeFileSync(
        `${fsDirections.artistDBstore}/refused.json`,
        JSON.stringify(relevanteFile, null, 2),
        "utf-8"
    );
}

/**
 * Wrapper voor onderhoud functies om te exporteren.
 */
export default function doeOnderhoudAanArtistDB(fsDirections) {
    gooiOudeRefusedWeg(fsDirections);

    gooiOudeEventsWegUitAllowedEvents(fsDirections);

    sorteerStoreOpLengteVanKeys(fsDirections);
}

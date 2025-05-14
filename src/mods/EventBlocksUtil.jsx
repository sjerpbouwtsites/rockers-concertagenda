import { BEMify } from "./util.js";

class EventBlocksUtil {
    static createDates(musicEvent) {
        // FIXME naar eigen component
        const start = new Date(musicEvent.start);
        const enlargedBEM = musicEvent.enlarged
            ? "event-block__dates--enlarged"
            : "";

        let year;
        if (
            musicEvent.enlarged &&
            musicEvent.start.substring(0, 4) === this.currentYear
        ) {
            year = "numeric";
        }
        const startDateText = start.toLocaleDateString("nl", {
            // weekday: musicEvent.enlarged ? "short" : undefined,
            month: musicEvent.enlarged ? "2-digit" : "2-digit",
            day: "numeric",
            year,
            hour: "2-digit",
            minute: "2-digit"
        });
        const startDateHTML = `<time className="event-block__dates event-block__dates--start-date ${enlargedBEM}" 
        dateTime="${musicEvent.start}">${startDateText}</time>`;
        if (!musicEvent.enlarged) {
            return startDateHTML;
        }

        let openDoorDateHTML = "";
        if (musicEvent.door) {
            const deurTijd = musicEvent.door.match(/T(\d\d:\d\d)/)[1];
            openDoorDateHTML = `<time className="event-block__dates event-block__dates--door-date ${enlargedBEM}" 
            dateTime="${musicEvent.door}">deur: ${deurTijd}</time>`;
        }

        let endDateHTML = "";
        if (musicEvent.end) {
            // const endText = (new Date(musicEvent.door)).toLocaleDateString("nl", {
            //   hour: "2-digit",
            //   minute: "2-digit",
            // });
            const eindTijd = musicEvent.end.match(/T(\d\d:\d\d)/)[1];
            endDateHTML = `<time className="event-block__dates event-block__dates--end-date ${enlargedBEM}" 
            dateTime="${musicEvent.end}">eind: ${eindTijd}</time>`;
        }

        return `${startDateHTML}${openDoorDateHTML}${endDateHTML}`;
    }
    // eslint-disable-next-line
    static getSelectors(musicEvent, sharedModifiers, monthEvenOddCounter) {
        const isEven = monthEvenOddCounter % 2 === 0;
        return {
            article: `
provide-dark-contrast
${isEven ? "provide-dark-contrast--variation-1" : ""}
${BEMify("event-block", [
    musicEvent.location.slug,
    musicEvent.enlarged ? "enlarged" : "",
    musicEvent.soldOut ? "sold-out" : "",
    musicEvent.firstOfMonth ? "first-of-month" : "",
    musicEvent.soldOut ? "sold-out" : "",
    musicEvent.title.length > 36 ? "long-title" : "short-title",
    musicEvent.title.length < 16 ? "tiny-title" : "",
    musicEvent.longText ? "interactive" : "no-longTextHTML",
    Math.random() > 0.8 ? "random-style" : "",
    Math.random() > 0.5 ? "random-style-2" : "",
    Math.random() > 0.5 ? "random-style-3" : ""
])}`,

            header: `${BEMify("event-block__header contrast-with-dark", sharedModifiers)}`,
            headerH2: `${BEMify("contrast-with-dark event-block__title", sharedModifiers)}`,
            headerEventTitle: `${BEMify(
                "event-block__title-showname plain-sans-serif-font",
                sharedModifiers
            )}`,
            headerLocation: `${BEMify(
                "event-block__title-location color-green green-color event-block__header-text cursive-font",
                sharedModifiers
            )}`,
            sluitEnlargedBtn: `${BEMify("event-block__sluit-enlarged-btn", sharedModifiers)}`,
            image: BEMify("event-block__image", sharedModifiers),
            dates: `${BEMify(
                "event-block__dates event-block__header-text contrast-with-dark",
                sharedModifiers
            )}`,
            headerShortText: `${BEMify(
                "event-block__paragraph event-block__header-text contrast-with-dark",
                ["short-text", ...sharedModifiers]
            )} `,
            main: `${BEMify("event-block__main contrast-with-dark", sharedModifiers)}`,
            mainContainerForEnlarged: BEMify(
                "void-container-for-enlarged",
                sharedModifiers
            ),
            footer: `${BEMify("event-block__footer", sharedModifiers)} `,
            hideSoldOutBtn: `${BEMify("event-block__hide-sold-out", sharedModifiers)} `
        };
    }
    // eslint-disable-next-line
    static bewerktMusicEventTitle(musicEvent) {
        const met = musicEvent.title;
        let shortestText = EventBlocksUtil.createShortestText(musicEvent);

        const titleIsCapsArr = met
            .split("")
            .map((char) => char === char.toUpperCase());
        const noOfCapsInTitle = titleIsCapsArr.filter((a) => a).length;
        const metl = met.length;
        const toManyCapsInTitle = (metl - noOfCapsInTitle) / metl < 0.5;
        if (toManyCapsInTitle) {
            // eslint-disable-next-line
            musicEvent.title =
                met[0].toUpperCase() + met.substring(1, 500).toLowerCase();
        }

        if (musicEvent.title.length > 45) {
            const splittingCandidates = ["+", "&", ":", ">", "•"];
            let i = 0;
            do {
                const reg2 = RegExp(`/.*${i}/`);
                const reg1 = RegExp(`/${i}.*/`);
                const beginDeel = musicEvent.title.replace(reg1, "").trim();
                const tweedeDeel = musicEvent.title.replace(reg2, "").trim();
                musicEvent.title = beginDeel;
                shortestText = `${tweedeDeel} ${shortestText}`;
                i += 1;
            } while (
                musicEvent.title.length > 45 &&
                i < splittingCandidates.length
            );
            shortestText =
                shortestText[0].toUpperCase() +
                shortestText.substring(1, 500).toLowerCase();
        }

        if (musicEvent.title.length > 45) {
            musicEvent.title = musicEvent.title
                .replace(/\(.*\)/, "")
                .replace(/\s{2,25}/, " ");
        }
        musicEvent.shortestText = shortestText;
        return musicEvent;
    }
    /**
     * Pas vlak voor de render weet je, want na filtering,
     * welke musicEvents de eerste van de maand zijn.
     */
    static addFirstOfMonth(filteredMusicEvents) {
        return filteredMusicEvents.map((musicEvent, musicEventIndex) => {
            // eslint-disable-next-line
            musicEvent.firstOfMonth = false;
            const start = new Date(musicEvent.start);
            // eslint-disable-next-line
            musicEvent.eventMonth = start.toLocaleDateString("nl", {
                year: "numeric",
                month: "short"
            });
            if (!musicEventIndex || !filteredMusicEvents[musicEventIndex - 1]) {
                // eslint-disable-next-line
                musicEvent.firstOfMonth = true;
            }
            if (
                musicEvent.eventMonth !==
                filteredMusicEvents[musicEventIndex - 1]?.eventMonth
            ) {
                // eslint-disable-next-line
                musicEvent.firstOfMonth = true;
            }
            return musicEvent;
        });
    }

    // eslint-disable-next-line
    static createShortestText(musicEvent) {
        // eslint-disable-line
        if (!musicEvent.shortText) return "";
        const m = 15;
        const splitted = musicEvent.shortText?.split(" ") ?? null;
        if (!splitted) return "";
        let s = splitted.splice(0, m).join(" ") ?? "";
        if (splitted.length > m) {
            s += "...";
        }
        return s;
    }
}

export default EventBlocksUtil;

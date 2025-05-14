import React, { Component } from "react";
import { BEMify } from "./util.js";

class EventBlocksImage extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        const { musicEvent } = this.props;

        let priceText = null;
        if (musicEvent.soldOut) {
            priceText = "Uitverkocht!";
        } else if (musicEvent?.price === null) {
            priceText = "€?";
        } else if (musicEvent?.price) {
            priceText = `€ ${Number(musicEvent?.price).toFixed(2).toString().replace(".", ",")}`;
        } else if (musicEvent?.origin === "ticketmaster") {
            // TODO is die origin er nog?
            priceText = "Gratis";
        } else {
            return "";
        }

        const sharedModifiers = [
            musicEvent.soldOut ? "sold-out" : "",
            musicEvent.enlarged ? "enlarged" : ""
        ];

        const priceSelectors = BEMify(
            "event-block__price anthracite-color",
            sharedModifiers
        );

        const emoji = musicEvent.soldOut ? "💀" : "🎫";
        return (
            <a
                className={BEMify(
                    "event-block__venue-link event-block__price-link-wrapper",
                    sharedModifiers
                )}
                href={musicEvent.venueEventUrl}
                target="_blank"
                rel="noreferrer"
            >
                <span className="ticketemoji contrast-with-dark">{emoji}</span>
                <span className={priceSelectors}>{priceText}</span>
            </a>
        );
    }
}

export default EventBlocksImage;

import React, { Component } from "react";

class EventBlocksImage extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        const { musicEvent, imageClassName } = this.props;

        if (musicEvent?.image?.includes("https") ?? false) {
            return (
                <img
                    src={musicEvent.image}
                    width="440"
                    height="220"
                    className={imageClassName}
                    alt={musicEvent.title}
                />
            );
        }

        let imgSrc = musicEvent.image
            ? `${musicEvent.image}`
            : `/location-images/${musicEvent.location.slug}`;

        imgSrc = imgSrc.replace("../public", "");

        const srcset = `${imgSrc}-w750.webp 750w`;
        const sizes = "(min-width: 480px) 750px";
        const src = `${imgSrc}-w440.webp`;

        return imgSrc ? (
            <img
                src={src}
                srcSet={srcset}
                sizes={sizes}
                width="440"
                height="220"
                className={imageClassName}
                alt={musicEvent.title}
            />
        ) : (
            ""
        );
    }
}

export default EventBlocksImage;

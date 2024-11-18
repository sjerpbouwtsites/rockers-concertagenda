import fs from "fs";
import sharp from "sharp";

function initLocationImagesConversion() {
    const eventImagesDestFolder =
        "/home/sjerp/hosted/rockagenda/public/location-images/";
    const eventImagesSourceFolder =
        "/home/sjerp/hosted/rockagenda/src/location-images/";
    const files = fs.readdirSync(eventImagesSourceFolder).map((file) => {
        const fileZonder = file.replace(/.jpg|.jpeg|.png|.webp/, "");
        return {
            source: `${eventImagesSourceFolder}${file}`,
            dest: `${eventImagesDestFolder}${fileZonder}`
        };
    });

    recursiveFileConversion(files);
}

async function recursiveFileConversion(files) {
    while (files.length) {
        const thisFile = files.shift();
        console.log(thisFile);
        await downloadImageCompress(thisFile.source, thisFile.dest);
    }
}

async function downloadImageCompress(image, imagePath) {
    if (!fs.existsSync(`${imagePath}-w440.webp`)) {
        sharp(image)
            .resize(440, 225)
            .webp()
            .toFile(`${imagePath}-w440.webp`, (err, info) => {
                console.log(`klaar met ${image}`);
            });
    }

    if (!fs.existsSync(`${imagePath}-w750.webp`)) {
        sharp(image)
            .resize(750, 360)
            .webp()
            .toFile(`${imagePath}-w750.webp`, (err, info) => {
                console.log(`klaar met ${image}`);
            });
    }

    if (!fs.existsSync(`${imagePath}-vol.webp`)) {
        sharp(image)
            .webp()
            .toFile(`${imagePath}-vol.webp`, (err, info) => {
                console.log(`klaar met ${image}`);
            });
    }

    // await waitTime(400);
}

initLocationImagesConversion();

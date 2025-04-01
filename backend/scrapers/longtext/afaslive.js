/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        () => {
            const res = {};

            res.mediaForHTML = "";

            res.textForHTML =
                document.querySelector(".floated.intro").outerHTML;
            return res;
        },
        { event }
    );
}

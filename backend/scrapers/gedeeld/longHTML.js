function youtubeSRCToIframe(src) {
    return `<iframe width="380" data-zelfgebouwd height="214" src="${src}" frameborder="0" allowfullscreen></iframe>`;
}

function youtubeIDToIframe(id) {
    return `<iframe width="380" data-zelfgebouwd height="214" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`;
}

export default function makeLongHTML(event) {
    const mediaHTML = !Array.isArray(event.mediaForHTML)
        ? ""
        : event.mediaForHTML
              .map((bron) => {
                  if (bron.outer && bron.type === "youtube") {
                      return `<div class='iframe-wrapper-16-9'>${bron.outer}</div>`;
                  }
                  if (bron.outer && bron.type === "spotify") {
                      return `<div class='iframe-wrapper-152px'>${bron.outer}</div>`;
                  }
                  if (bron.outer) {
                      return `<div class='iframe-wrapper-generiek'>${bron.outer}</div>`;
                  }
                  if (bron.src && bron.type === "youtube") {
                      return `<div class='iframe-wrapper-16-9'>${youtubeSRCToIframe(
                          bron.src
                      )}</div>`.replace('"=""', ""); //TODO hack
                  }
                  if (bron.id && bron.type === "youtube") {
                      return `<div class='iframe-wrapper-16-9'>${youtubeIDToIframe(
                          bron.id
                      )}</div>`;
                  }
                  if (bron.src && bron.type !== "youtube") {
                      return `onbekende type ${bron.type}`;
                  }
                  return JSON.stringify(bron);
              })
              .join("");

    const mediaSection = mediaHTML
        ? `<section class='long-html__music-videos'>${mediaHTML}</section>`
        : "";
    const socialsHTML = !Array.isArray(event.socialsForHTML)
        ? ""
        : event.socialsForHTML
              .map(
                  (socialHTML) =>
                      `<li class='long-html__social-list-item'>${socialHTML}</li>`
              )
              .join("");
    const socialsSection = socialsHTML.length
        ? `<nav class="long-html__social">
    <ul class='long-html__social-list'>
      ${socialsHTML}
    </ul>
  </nav>`
        : "";

    // headings omlaag gooien.
    const thtml =
        event.textForHTML
            ?.replaceAll("h6", "strong")
            .replaceAll("h5", "strong")
            .replaceAll("h4", "strong")
            .replaceAll("h3", "h4")
            .replaceAll("h1", "h2")
            .replaceAll("h2", "h3") ?? "";

    const reshtml = `
    <div class='long-html'>
    <section class='long-html__text'>
    ${thtml}
    </section>
    ${mediaSection}
    ${socialsSection}
    </div>
  `;

    return reshtml;
}

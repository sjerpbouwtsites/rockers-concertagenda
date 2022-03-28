async function getPageInfo() {
  const pageInfoPromise = new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() > 0.33) {
        console.log("resolve");
        resolve({
          hoera: true,
        });
      } else {
        console.log("reject");
        reject(new Error("NEE"));
      }
    }, 230 + Math.random() * 1500);
  });

  return Promise.allSettled([
    pageInfoPromise,
    allwaysSuccessfullEmptyObject(),
  ]).then((responses) => {
    return responses.find((response) => response.status === "fulfilled");
  });

  //pageInfoPromise
}

function allwaysSuccessfullEmptyObject() {
  return new Promise((resolve, reject) => {
    resolve({
      fake: true,
    });
  });
}

async function init() {
  const superData = await getPageInfo();
  console.log(superData.value);
}

(() => {
  init();
})();

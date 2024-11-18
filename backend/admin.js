import fs from "fs";

fs.writeFileSync("./temp/error.log", "", "utf-8");

Array.from(fs.readdirSync("../public/texts")).forEach((textFile) => {
    const pathOfFile = `../public/texts/${textFile}`;

    const today = new Date();
    const currentAbsTime = today.getTime();
    fs.stat(pathOfFile, (err, stats) => {
        if (err) {
            throw err;
        }
        const lastModifiedAbSTime = new Date(stats.ctime).getTime();
        const diff = currentAbsTime - lastModifiedAbSTime;
        if (diff / 1000 / 60 / 60 / 48 > 1) {
            fs.unlink(pathOfFile, () => {});
        }
    });
});

function getShellArguments() {
    const shellArguments = {};
    process.argv.forEach((val, index) => {
        if (index < 2) {
            return;
        }
        if (!val.includes("=")) {
            throw new Error(
                "Invalid shell arguments passed to node. Please use foo=bar bat=gee."
            );
        }
        const [argName, argValue] = val.split("=");
        shellArguments[argName] = argValue;
    });

    return shellArguments;
}

const shell = {
    _arguments: null,
    check: function (a) {
        if (a === "false") return a;
        if (a === "all") return a;
        if (typeof a === "string") return a.split("%");
        return false;
    },

    /**
     * see {@link HouseKeeping#baseEventsCleanup}
     */
    get removeBaseEvents() {
        return this.check(this._arguments?.removeBaseEvents);
    },

    /**
     * see {@link HouseKeeping#publicEventImagesCleanup}
     */
    get removePublicEventImages() {
        return this.check(this._arguments?.removePublicEventImages);
    },

    /**
     * see {@link HouseKeeping#longTextFilesCleanup}
     */
    get removeLongTextFiles() {
        return this.check(this._arguments?.removeLongTextFiles);
    },

    /**
     * see {@link HouseKeeping#singlePageCacheCleanup}
     */
    get removeSinglePageCache() {
        return this.check(this._arguments?.removeSinglePageCache);
    },
    get debugLongHTML() {
        return this._arguments?.debugLongHTML ?? null;
    },
    get scraperEventsLongTextDebug() {
        return this.check(this._arguments?.scraperEventsLongTextDebug);
    },
    get workers() {
        return this._arguments?.workers;
    },
    /**
     * of de artist db de refused, allowed, unclear etc moet schrijven.
     */
    get artistDBWrite() {
        return this._arguments?.artistDBWrite === "true" || null;
    },
    get noLocPrint() {
        return this._arguments?.noLocPrint === "true" || false;
    }
};

shell._arguments = getShellArguments();

export default shell;

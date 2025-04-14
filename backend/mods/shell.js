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

    // if (shellArguments.force && shellArguments.force.includes("all")) {
    //   shellArguments.force += Object.keys(
    //     JSON.parse(fs.readFileSync(fsDirections.timestampsJson))
    //   ).join(";");
    // }

    return shellArguments;
}

const shell = {
    _arguments: null,
    get force() {
        return this._arguments?.force || null;
    },
    get forceSet() {
        return this._arguments?.forceSet || null;
    },
    get forceAll() {
        return this._arguments?.force?.includes("all") || false;
    },
    get forceThese() {
        return (
            (this._arguments?.force?.split(",") ?? []).map((f) =>
                f.replace("%", "")
            ) ?? []
        );
    },

    get resetActiveWorkersBases() {
        return (
            (this._arguments?.resetActiveWorkersBases &&
                this._arguments?.resetActiveWorkersBases === "true") ||
            false
        );
    },

    get keepImages() {
        return this._arguments?.keepImages || false;
    },
    get debugLongHTML() {
        return this._arguments?.debugLongHTML || false;
    },
    get workers() {
        return this._arguments?.workers || null;
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

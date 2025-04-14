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
    _c(a) {
        if (a === false) return a;
        if (a === "all") return a;
        if (typeof a === "string") return this._splitArguments(a);
        return false;
    },
    _splitArguments(args) {
        return (args.split("%") ?? []).map((f) => f.replace(" ", "")) ?? [];
    },

    get removeBaseEvents() {
        return this._c(this._arguments?.removeBaseEvents);
    },

    get removePublicEventImages() {
        return this._c(this._arguments?.removePublicEventImages);
    },

    get removeLongTextFiles() {
        return this._c(this._arguments?.removeLongTextFiles);
    },
    get removeSinglePageCache() {
        return this._c(this._arguments?.removeSinglePageCache);
    },
    get debugLongHTML() {
        return this._arguments?.debugLongHTML ?? null;
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

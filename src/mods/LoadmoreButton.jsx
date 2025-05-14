import React from "react";

class LoadmoreButton extends React.Component {
    intervalSpeed = 3000;

    constructor(props) {
        super(props);
        this.state = {
            inView: false,
            hasDoneNewLoad: false,
            hasLoadedEverything: false
        };
        this.checkButtonIsAboutInView =
            this.checkButtonIsAboutInView.bind(this);
    }

    componentDidMount() {
        setInterval(this.checkButtonIsAboutInView, this.intervalSpeed);
        setTimeout(() => {
            this.setState({ hasDoneNewLoad: true });
        }, this.intervalSpeed - 500);
    }

    componentDidUpdate() {
        const { maxEventsShown, musicEventsLength } = this.props;
        const { hasLoadedEverything } = this.state;
        if (maxEventsShown === musicEventsLength && !hasLoadedEverything) {
            this.setState({
                hasLoadedEverything: true
            });
        }
    }

    checkButtonIsAboutInView() {
        const { hasLoadedEverything, inView } = this.state;

        if (hasLoadedEverything) return;
        console.log("CHECKT BUTTON IS IN VIEW");

        const st =
            document.documentElement.scrollTop || document.body.scrollTop;
        // eslint-disable-next-line
        const ah = screen.availHeight;
        const mh = st + 1.5 * ah;
        const oh = document.body.offsetHeight;
        const newState = (mh - oh) / ah > 0;
        if (newState === inView) {
            return;
        }
        this.setState({ inView: newState });
        const { hasDoneNewLoad } = this.state;
        if (hasDoneNewLoad && newState) {
            const { add100ToMaxEventsShown } = this.props;
            add100ToMaxEventsShown();
            this.setState({ hasDoneNewLoad: false });
            setTimeout(() => {
                this.setState({ hasDoneNewLoad: true });
            }, this.intervalSpeed);
        }
    }

    render() {
        const {
            eventDataLoaded,
            add100ToMaxEventsShown,
            maxEventsShown,
            musicEventsLength,
            hasLoadedEverything
        } = this.props;
        if (!eventDataLoaded) return "";
        if (hasLoadedEverything) return "";

        return (
            <button
                type="button"
                className="event-block__more-blocks"
                onClick={add100ToMaxEventsShown}
                id="load-more-button"
            >
                <span>
                    {maxEventsShown} van {musicEventsLength} geladen. Klik voor
                    meer.
                </span>
            </button>
        );
    }
}

export default LoadmoreButton;

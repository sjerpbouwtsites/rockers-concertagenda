import React from "react";

class LoadmoreButton extends React.Component {
    intervalSpeed = 3000;

    hasLoadedEverything = false;

    constructor(props) {
        super(props);
        this.state = {
            inView: false,
            hasDoneNewLoad: false
        };
        this.checkButtonIsInView = this.checkButtonIsInView.bind(this);
    }

    componentDidMount() {
        setInterval(this.checkButtonIsInView, this.intervalSpeed);
        setTimeout(() => {
            this.setState({ hasDoneNewLoad: true });
        }, this.intervalSpeed - 500);
    }

    componentDidUpdate() {
        const { maxEventsShown, musicEventsLength } = this.props;
        if (maxEventsShown === musicEventsLength) {
            this.hasLoadedEverything = true;
        }
    }

    checkButtonIsInView() {
        if (this.hasLoadedEverything) return;

        const st =
            document.documentElement.scrollTop || document.body.scrollTop;
        // eslint-disable-next-line
        const ah = screen.availHeight;
        const mh = st + ah;
        const oh = document.body.offsetHeight;
        const newState = (mh - oh) / ah > 0;
        const { inView } = this.state;
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
            musicEventsLength
        } = this.props;
        if (!eventDataLoaded) return "";
        if (this.hasLoadedEverything) return "";
        if (maxEventsShown === musicEventsLength) return "";
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

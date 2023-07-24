import React from "react";

class LoadmoreButton extends React.Component {

  intervalSpeed = 500;
  
  constructor(props) {
    super(props);
    this.state = {
      inView: false,
      passedFirstLoad: false
    };    
    this.checkButtonIsInView = this.checkButtonIsInView.bind(this);
    this.add100ToMaxEventsShown = props.add100ToMaxEventsShown;
  }

  componentDidMount(){
    setInterval(this.checkButtonIsInView,this.intervalSpeed)
    setTimeout(()=>{
      this.setState({ passedFirstLoad: true });
    }, 2500)
  }

  componentDidUpdate(){
    
  }

  checkButtonIsInView(){
    if (this.props.maxEventsShown === this.props.musicEventsLength) {
      false;
    }
    
    const st = document.documentElement.scrollTop || document.body.scrollTop;
    const ah = screen.availHeight;
    const mh = st + ah;
    const oh = document.body.offsetHeight;
    const newState = ((mh - oh) / ah) > 0;
    const oldState = this.state.inView;

    if (newState === oldState){
      return;
    }

    if (newState !== oldState){
      console.log('change')
      this.setState({ inView: newState });
    }
    if (this.state.passedFirstLoad && newState){
      console.log('JA');
      this.add100ToMaxEventsShown();
      this.setState({ passedFirstLoad: false });
      setTimeout(()=>{
        this.setState({ passedFirstLoad: true });
      }, this.intervalSpeed)
    } else {
      console.log(this.state.passedFirstLoad, newState)
    }
  }

  render() {
    if (!this.props.eventDataLoaded) return '';
    if (this.props.maxEventsShown === this.props.musicEventsLength) return '';
    return (
      <button
        className={`event-block__more-blocks`}
        onClick={this.add100ToMaxEventsShown}
        id='load-more-button'
      >
        <span>
          {this.props.maxEventsShown} van {this.props.musicEventsLength}{" "}
        geladen. Klik voor meer.
        </span>
      </button>
    )
  }
}

export default LoadmoreButton;
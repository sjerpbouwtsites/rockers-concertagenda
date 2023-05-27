/**
 * Wrapper om alle errors heen.
 *
 * @property {*} workerData 
 * @property {string|null} remarks opmerkingen
 * @property {notice|close-thread|close-app|null} errorLevel 
 * @property {*|null} toDebug key title wordt hier uit in de titel gezet
 */
export default class ErrorWrapper {
  remarks = null;
  errorLevel = null;
  workerData = null;
  error = null;
  toDebug = null;  
  constructor(instantiationData){
    this.create(instantiationData)
  }

  isValid(){
    return true;
  }
  // isValid(){
  //   return true || ErrorWrapper.workerDataValid(this.workerData)
  //   // && ErrorWrapper.remarksValid(this.remarks)
  //   // && ErrorWrapper.errorLevelValid(this.errorLevel)
  //   // && ErrorWrapper.toDebugValid(this.toDebug)
  // }

  create({error, workerData, remarks, errorLevel, toDebug}){
    this.setError(error);
    this.setWorkerData(workerData);
    this.setRemarks(remarks)
    this.setErrorLevel(errorLevel);
    this.setToDebug(toDebug)
  }

  static workerDataValid(value){
    const hasIndex = Object.prototype.hasOwnProperty.call(value, 'index');
    const hasFamily = Object.prototype.hasOwnProperty.call(value, 'family');
    const hasName = Object.prototype.hasOwnProperty.call(value, 'name');    
    if (!hasIndex || !hasFamily || !hasName) {
      throw new Error(`invalid workerData object. Type ${typeof value}`)
    } 
    return true;
  }
  setWorkerData(value){
    if(!value) return // wordt in base event en getpageinfo in abstract scraper gedaan.
    if (ErrorWrapper.workerDataValid(value)) {
      this.workerData = value;
    } 
  }  

  static errorValid(value){
    if (value instanceof Error){
      return true;
    } 
    throw new Error(`typeerror error. Type ${typeof value}  ${JSON.stringify(value)}`)
  }
  setError(error){
    if (ErrorWrapper.errorValid(error)){
      this.error = error;
    }
  }


  static remarksValid(value){
    if (typeof value !== 'string'){
      throw new Error(`typeerror remarks. Type ${typeof value}`)
    } 
    return true;
  }
  setRemarks(value = ''){
    if (ErrorWrapper.remarksValid(value)) {
      this.remarks = value;
    } 
  }


  static errorLevelValid(value){
    if (!['notice', 'close-thread', 'close-app'].includes(value)){
      throw new Error(`Unknown errorLevel ${value}`)
    }
    return true;
  }
  setErrorLevel(value = 'notice') {
    if (ErrorWrapper.errorLevelValid(value)) {
      this.errorLevel = value
    }
  }


  static toDebugValid(){
    return true;
  }
  setToDebug(value = null){
    if (!value) return;
    if (ErrorWrapper.toDebugValid(value)){
      this.toDebug = value;        
    }
  }
}
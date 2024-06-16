export default class DbInterfaceToScraper {
  event = null;

  success = null;

  break = false;

  reasons = [];

  reason = '';

  data = {};

  id = null;

  successReversed = false;

  constructor(dbAnswer, olderReasons = [], id = null) {
    if (typeof dbAnswer?.success === 'string') {
      this.success = `${dbAnswer.success}`;
    } else {
      this.success = dbAnswer?.success && true;
    }
    if (Array.isArray(olderReasons)) {
      const rc = [...olderReasons];
      this.reasons = rc;
    } else {
      this.reasons = [];
    }
    this.reasons.unshift((`${dbAnswer.reason}`));
    this.event = { ...dbAnswer.event };
    if (dbAnswer?.data) {
      this.data = { ...dbAnswer.data };
    }
    
    this.id = id;
  }

  get isSuccess() {
    return this.success === true;
  }

  get isFailed() {
    return this.success === false;
  }

  get isError() {
    return this.success === 'error';
  }

  get isNull() {
    return this.success === null;
  }

  get hasReasons() {
    return this.reasons.length > 0;
  }

  get lastReason() {
    if (this.reasons.length < 1) return 'no reasons';
    return this.reasons[0];
  }

  reverseSuccessLogic() {
    if (this.isError || this.isNull) return this;
    if (this.isSuccess) {
      this.success = false;
    } else if (this.isFailed) this.success = true;
    this.successReversed = !this.successReversed;
    return this;
  }

  setBreak(breakA = false) {
    this.break = breakA;
    return this;
  }

  addReason(reason) {
    this.reasons.unshift(reason);
    return this;
  }

  setReason() {
    const r = [...this.reasons.filter((re) => re)];
    this.reason = r.join(`, `);
    return this;
  }
}

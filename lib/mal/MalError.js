/**
 * 
 */
class MalError {
  /**
   * errCode:
   * 0 - Status != 200, != 404
   * 1 - Bad result message
   * 2 - Not found (404)
   */
  constructor(errMessage, statusCode, url = null, errCode = 0) {
    this.url = url;
    this.statusCode = statusCode;
    this.errCode = errCode;
    this.errMessage = errMessage;
  }

  /**
   *
   */
  toString() {
    return "Error " + this.errCode + " (status " + this.statusCode + "): " + this.errMessage;
  }

  /**
   *
   */
  static fromJSON(obj) {
    let me = new cls();
    for (let k of ['url', 'statusCode', 'errCode', 'errMessage']) {
      if (obj[k] !== undefined)
        me[k] = obj[k];
    }
    return me;
  }

}
var cls = MalError; //for using "cls.A" as like "self::A" inside class

module.exports = MalError;

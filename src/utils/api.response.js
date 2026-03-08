export default {
  success: (res, data) => {
    const responseData = {
      data,
      success: true,
      error: null
    }
    res.status(200).json(responseData);
  },
  /**
   * 
   * @param {*} res 
   * @param {*} msg Error message to be sent in the response
   * @param {*} code Optional HTTP status code (default is 400)
   */
  failed: (res, msg = '', code = 400) => {
    const responseData = {
      data: null,
      success: false,
      error: {
        msg,
        code
      }
    }
    res.status(200).json(responseData);
  },
  serverError: (res, message) => {
    res.status(500).json({ success: false, error: message });
  }
}

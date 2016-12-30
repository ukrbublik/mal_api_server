var isTest = false; //todo
var config = {
  api: {
    apiServerPort: isTest ? 8800 : 80,
  },
  parser: {
    requestsQueueMaxConcurrent: 5,
    requestsQueueMaxQueue: Infinity,
    logHttp: true,
    retryTimeout: 5000,
    maxRetrues: 5,
  }
};

module.exports = config;

var isTest = (process.env.isTest == '1');
var config = {
  api: {
    apiServerPort: isTest ? 8800 : 
      (process.env.PORT ? process.env.PORT : 80),
  },
  parser: {
    requestsQueueMaxConcurrent: 20,
    requestsQueueMaxQueue: Infinity,
    logHttp: true,
    retryTimeout: 5000,
    maxRetrues: 5,
  }
};

module.exports = config;

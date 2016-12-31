var isTest = (process.env.isTest == '1');
var config = {
  api: {
    apiServerPort: isTest ? 8800 : 
      (process.env.PORT ? process.env.PORT : 80),
  },
  parser: {
    requestsQueueMaxConcurrent: 2,
    requestsQueueMaxQueue: Infinity,
    logHttp: true,
    retryTimeout: 4000,
    maxRetries: 4,
  }
};

module.exports = config;

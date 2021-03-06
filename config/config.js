var isTest = (process.env.isTest == '1');
var config = {
  api: {
    apiServerPort: isTest ? 8800 : 
      (process.env.PORT ? process.env.PORT : 80),
  },
  parser: {
    queueSizeConcurrent: 20,
    parserQueueSizeConcurrent: 10,
    logHttp: true,
    retryTimeout: [3000, 5000],
    maxRetries: 7,
  }
};

module.exports = config;

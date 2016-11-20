const appInsights = require('applicationinsights');
const auth = require('./middleware/auth');
const config = require('painless-config');
const mockInsights = require('./lib/mockInsights');
const OspoCrawler = require('./lib/ospoCrawler');
const CrawlerService = require('ghcrawler').crawlerService;
const express = require('express');
const logger = require('morgan');
const bodyParser = require('body-parser');

mockInsights.setup(config.get('GHCRAWLER_INSIGHTS_KEY'), true);

const crawler = OspoCrawler.createTypicalSetup(config.get('GHCRAWLER_QUEUE_PROVIDER'));
const service = new CrawlerService(crawler);

const authConfig = {
  redisUrl: config.get('GHCRAWLER_REDIS_URL'),
  redisPort: config.get('GHCRAWLER_REDIS_PORT'),
  redisAccessKey: config.get('GHCRAWLER_REDIS_ACCESS_KEY'),
  forceAuth: true || config.get('FORCE_AUTH'),
  sessionSecret: config.get('WITNESS_SESSION_SECRET'),
  aadConfig: {
    clientID: config.get('WITNESS_AAD_CLIENT_ID'),
    clientSecret: config.get('WITNESS_AAD_CLIENT_SECRET'),
    callbackURL: config.get('WITNESS_AAD_CALLBACK_URL'),
    resource: config.get('WITNESS_AAD_RESOURCE'),
    useCommonEndpoint: true
  }
};

const app = express();

// It's safe to set limitation to 2mb.
app.use(bodyParser.json());
app.use(logger('dev'));

// auth.initialize(app, authConfig);

app.use('/config', require('./routes/config')(service));
app.use('/requests', require('./routes/requests')(service));

// to keep AlwaysOn flooding logs with errors
app.get('/', function (request, response, next) {
  response['helpers'].send.noContent();
});

// Catch 404 and forward to error handler
const requestHandler = function (request, response, next) {
  let error = { message: 'Not Found'};
  error.status = 404;
  error.success = false;
  next(error);
};
app.use(requestHandler);

// Error handlers
const handler = function (error, request, response, next) {
  appInsights.client.trackException(error, { name: 'SvcRequestFailure' });
  if (response.headersSent) {
    return next(error);
  }
  response.status(error.status || 500);
  let propertiesToSerialize = ['success', 'message'];
  if (app.get('env') !== 'production') {
    propertiesToSerialize.push('stack');
  }
  // Properties on Error object aren't enumerable so need to explicitly list properties to serialize
  response.send(JSON.stringify(error, propertiesToSerialize));
  response.end();
};
app.use(handler);

module.exports = app;
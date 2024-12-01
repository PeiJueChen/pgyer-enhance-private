/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

const { getDeviceConfig, getAllVersions } = require('./http');

const app = express();

const isPrd = process.env?.NODE_ENV != 'development';

const whitelist = ['https://pgyer-enhance.web.app'];
const corsOptions = {
  origin: (origin, callback) => {
    if (!isPrd) {
      callback(null, true);
      return;
    }
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS' + whitelist));
    }
  }
};
app.use(cors(corsOptions));

function returnError(res, message) {
  res.status(500).send(message);
}



app.use('/', async (req, res, next) => {

  if (!isPrd) {
    next();
    return;
  }
  const referer = req.get('Referer') || req.get('referer') || '';

  try {
    const url = new URL(referer);
    const hostname = url.hostname;
    const valids = ['pgyer-enhance.web.app',];

    if (!valids.includes(hostname)) {
      returnError(res, `Please don't do like this!`);
      return;
    }

  } catch (error) {
    returnError(res, `Please don't do like this!`);
    return;
  }

  next();
});

function base64(str) {
  const buffer = Buffer.from(str, 'utf-8');
  return buffer.toString('base64');
}

var _deviceData = null;
https://us-central1-aigensstoretest.cloudfunctions.net/appdownload/init
app.get('/init', async (req, res) => {
  const referer = req.get('Referer') || req.get('referer') || '';
  var deviceData = {};
  try {
    var rsp = await getDeviceConfig()
    deviceData = rsp?.data?.data || {};
  } catch (error) {
    returnError(res, error?.message);
    return;
  }
  deviceData.originalUrl = req.originalUrl;
  deviceData.referer = referer;
  _deviceData = deviceData;
  deviceData['NODE_ENV'] = process.env.NODE_ENV;


  const dd = base64(encodeURIComponent(JSON.stringify(deviceData)));

  const r = `
    var deviceData = ${JSON.stringify({ 'result': "HBLZXkiOi" + dd })};
  `
  res.send(r);
});
// xxx/versions?platform=xx&env=xxx&app=xxx
app.get('/versions', async (req, res) => {
  const query = req.query || {};
  const platform = query.platform;
  const env = query.env;
  const app = query.app;
  if (!platform || !env || !app) {
    returnError(res, 'missing parameters');
  }

  if (!_deviceData) {
    var rsp = await getDeviceConfig()
    _deviceData = rsp?.data?.data || null;
  }

  if (!_deviceData) {
    returnError(res, 'device data not found');
    return;
  }

  var apiKey = _deviceData?.defaultPgyerApiKey;
  const projects = _deviceData?.projects || [];
  const appObj = projects.find(p => p.name === app);
  if (!appObj) {
    returnError(res, "app not found");
    return;
  }
  const currentAppInfo = appObj?.['pgyer']?.[platform]?.[env];
  if (!currentAppInfo) {
    returnError(res, "app version not found");
    return;
  }
  const pgyerOriginalLink = !!currentAppInfo?.channel ? `https://www.pgyer.com/${currentAppInfo?.channel}` : '';
  apiKey = currentAppInfo?.apiKey || apiKey;
  const buildPassword = currentAppInfo?.buildPassword;
  const appKey = currentAppInfo?.appKey;
  delete currentAppInfo.appKey;
  delete currentAppInfo.channel;
  // const base64 = (str) => {
  //   const buffer = Buffer.from(str, 'utf-8');
  //   return buffer.toString('base64');
  // }
  // if (buildPassword) {
  //   currentAppInfo.buildPassword = base64(buildPassword + "@igens!");
  // }
  // currentAppInfo['pgyerOriginalLink'] = pgyerOriginalLink;
  const versions = await getAllVersions(apiKey, appKey, 1, env);
  // currentAppInfo['versions'] = versions;

  res.json({ versions: "S1JeBfseDESE" + base64(encodeURIComponent(JSON.stringify(versions))) });
});


exports.appdownload = functions.https.onRequest(app);

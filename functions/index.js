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

const { getDeviceConfig } = require('./http');

// 创建一个 Express 应用
const app = express();

function returnError(res, message) {
  res.status(500).send(message);
}

const isPrd = true;

https://us-central1-aigensstoretest.cloudfunctions.net/appdownload/init
app.get('/init', async (req, res) => {
  const referer = req.get('Referer') || req.get('referer') || '';
  var originalUrl = (req.originalUrl || "").split('referer=')[1];
  originalUrl = decodeURIComponent(originalUrl);

  if (isPrd) originalUrl = "";

  if (!referer) {
    returnError(res, `Please don't do like this!`);
    return;
  }

  try {
    const url = new URL(referer);
    const hostname = url.hostname;
    const valids = ['pgyer-enhance.web.app', ];

    if (!valids.includes(hostname) && !originalUrl.includes('http://localhost:4200')) {
      returnError(res, `Please don't do like this!`);
      return;
    }

  } catch (error) {
    returnError(res, `Please don't do like this!`);
    return;
  }

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
  const r = `
    var deviceData = ${JSON.stringify(deviceData)};
  `
  res.send(r);
});




exports.appdownload = functions.https.onRequest(app);

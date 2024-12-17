const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
// https://aigensstoretest.aigens.com/api/v1/store/config.json?type=app&storeId=5704131641606144
const getDeviceConfig = async () => {
  const storeId = '_57041316416061_4';
  const t = () => {
    https://aigensstoretest.aigens.com/api/v1/store/config.json
    var h = "https://";
    h += "aigensstoretest_.";
    h += "aigens.com";
    h += "/api/v1/store/config.json";
    var u = h;
    u += "?type=app";
    u += `&storeId=${storeId}`;
    return encodeURIComponent(u);
  }

  return new Promise((resolve, reject) => {
    https.get(decodeURIComponent(t()).replace(/_/g, "") + "4", (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });

}


const get = async (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      });
    })).on('error', err => {
      reject(error);
    })
  });
}

const post = async (url, body, headers) => {
  return new Promise((resolve, reject) => {
    if (!headers) headers = {};
    if (!body) body = {};
    const urlObj = new URL(url);
    urlObj.searchParams && urlObj.searchParams.forEach((value, key) => {
      if (body[key]) {
        if (Array.isArray(body[key])) {
          body[key].push(value);
        } else {
          body[key] = [body[key], value];
        }
      } else {
        body[key] = value;
      }
    });

    const data = querystring.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      // port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        // 'Content-Type': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
        ...headers
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk.toString();;
      });

      res.on('end', () => {
        try {
          const jsonResponse = JSON.parse(responseBody);
          resolve(jsonResponse);
        } catch (error) {
          reject(new Error('Failed to parse response as JSON'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

const post2 = async (url, body, headers) => {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          code: res.statusCode,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

var allVersions = [];
const _getAllVerions = async (apiKey, appKey, page) => {
  const host = "https://www.pgyer.com";
  // https://www.pgyer.com/apiv2/app/builds?_api_key=0202f5206763d902070f95c7826cb794&appKey=f10fc35f8027b9674d3979977a9972d0&channelKey=88dc901e6112b228f0c62833706d7b06&page=1
  const url = host + "/apiv2/app/builds";
  if (!page) page = 1;

  try {
    var rsp = await post(url, { _api_key: apiKey, appKey, page })
  } catch (error) {

  }
  const list = rsp?.data?.list || [];

  const pageCount = rsp?.data?.pageCount || 1;
  const currentPage = page;

  allVersions.push(...list);
  if (currentPage < pageCount) {
    await _getAllVerions(apiKey, appKey, currentPage + 1);
  }
  const result = [...allVersions]
  return result;
}

const getAllVersions = async (apiKey, appKey, page, env) => {
  allVersions = [];
  var result = [];
  try {
    result = await _getAllVerions(apiKey, appKey, page);
  } catch (error) {
  }
  if (result.length == 0) {
    return [];
  }
  const UAT_ENV = "Env: uat";
  const PRD_ENV = "Env: prd";
  const passEnv = env.toLocaleLowerCase();
  const getEnvString = () => {
    if (env) {
      env = env.toLocaleLowerCase();
      return (env.includes('uat') || env.includes('development') || env.includes('test')) ? UAT_ENV : PRD_ENV;
    }
    return "";
  }
  const envStr = getEnvString();
  let realIcon = "";
  result = result.filter(version => {
    version.realIcon = realIcon || `https://www.pgyer.com/image/view/app_icons/${version.buildIcon}`;
    realIcon = version.realIcon;
    if (passEnv != 'uat' && passEnv != 'prd') {
      return version?.buildUpdateDescription && version?.buildUpdateDescription.startsWith(env);
    }
    return (version?.buildUpdateDescription || UAT_ENV).includes(envStr);
  })

  allVersions = [];
  return result;

}

module.exports = {
  getDeviceConfig,
  get,
  post,
  post2,
  getAllVersions
}

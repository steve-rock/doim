window.onerror = function (err) {
  console.log('window.onerror: ' + err);
}

function setupWKWebViewJavascriptBridge(callback) {
  if (window.WKWebViewJavascriptBridge) { return callback(WKWebViewJavascriptBridge); }
  if (window.WKWVJBCallbacks) { return window.WKWVJBCallbacks.push(callback); }
  window.WKWVJBCallbacks = [callback];
  window.webkit.messageHandlers.iOS_Native_InjectJavascript.postMessage(null)
}

setupWKWebViewJavascriptBridge(function (bridge) {
  bridge.registerHandler('a1', a1);
  bridge.registerHandler('loadData', loadData);
})


// customize js
const configuration = {
  debug: true,
  host: "https://asian.vulibs.work",
  tmdbKey: "4d7bf7a313fd4192b96630ab86291705",
  key: CryptoJS.enc.Utf8.parse("ab4b10abaedd2e422b15ff7576307841"),
  iv: CryptoJS.enc.Utf8.parse("5f8bbc19y78f960f")
};

// helper function
function debug(data) {
  if (configuration.debug) {
    console.log(data);
  }
}

function nowTimeStamp() {
  return Math.round(new Date().getTime() / 1000);
}

/**
@param response: Response
@returns void
*/
function processResponse(response, nativeDataCallback) {
  response.json()
    .then((json) => {
      nativeDataCallback(response.ok ? responseDic(json, null) : responseDic(null, json))
    });
}

function responseDic(data, error) {
  return JSON.stringify({
    data: data,
    error: error
  })
}

// AES-CBC-128
function aesEncrypt(value) {
  var text = CryptoJS.enc.Utf8.parse(value);
  var encrypted = CryptoJS.AES.encrypt(text, configuration.key, {
    iv: configuration.iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
}

function aesDecrypt(value) {
  let ciphertext = CryptoJS.enc.Base64.parse(value);

  var decrypt = CryptoJS.AES.decrypt({ ciphertext: ciphertext }, configuration.key, {
    iv: configuration.iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return decrypt.toString(CryptoJS.enc.Utf8);
}

function parseGetData(text) {
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(text, 'text/html');
  const images = htmlDoc.getElementsByTagName('img');
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const prefix = "data:image/jpeg;";
    const src = image.src.replace(prefix, "");
    const decrypted = aesDecrypt(src);
    const json = JSON.parse(decrypted);
    if (decrypted != undefined && json != undefined) {
      return decrypted;
    }
  }
  return undefined;
}

//
// helper apis
function a1(input, responseCallback) {
  let idfa = input.idfa ?? '';

  debug("api json");

  let url = `http://ip-api.com/json`
  fetch(url, {
    method: "GET",
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
    .then((response) => response.json())
    .then((json) => {
      const { isp, org, as, query } = json;
      const data = {
        idfa, isp, org, as, query
      };
      return loadConfig(data, responseCallback);
    })
    .catch((error) => {
      debug(error);
      const data = {
        idfa,
        'isp': '',
        'org': '',
        'as': '',
        'query': '',
      };
      return loadConfig(data, responseCallback);
    });
}

function loadConfig(data, responseCallback) {
  localStorage.setItem('geoip', JSON.stringify(data));

  debug("loadConfig");
  debug(data);
  debug(localStorage.getItem('name'));

  let url = `${configuration.host}`;
  let geoip = localStorage.getItem('geoip');
  let cookie = aesEncrypt(geoip);

  fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookie
    }
  })
    .then((response) => response.text())
    .then((text) => {
      const json = parseGetData(text);
      const { telegram, discord, frequency, time, timestamp, version, isNotification, extra, networks, rusers } = json;
      const timeConfig = Date.parse(time) / 1000; // seconds

      if (Math.abs(nowTimeStamp() - timestamp) < 60) {
        if (localStorage.getItem('first_open') == null) {
          localStorage.setItem('first_open', nowTimeStamp());
        }

        let first_open = parseInt(localStorage.getItem('first_open'));
        console.log('first_open', first_open);

        // live time
        let extraJSON = {};
        try {
          extraJSON = JSON.parse(extra);
        } catch (e) { }

        let goHome = timeConfig >= first_open;
        if (extraJSON != null && extraJSON['in_time'] != null) {
          let in_time = extraJSON['in_time']; // second gom don
          goHome = nowTimeStamp() >= first_open + in_time;
        }

        let result = {
          telegram, discord, frequency, time, version,
          rateapp: isNotification, extra: extraJSON,
          networks: networks.map((item) => {
            const { name, sort, adUnits } = item;
            return { name, sort, adUnits: adUnits.split(',').map((x) => x.trim()) };
          }),
          rusers, goHome
        };
        return responseCallback(responseDic(result, null));
      }
      else {
        // changed time
        responseCallback(null, null);
      }
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

// list apis
const HApiPath = {
  trending: "/motre",
  featured: "/mofe",
  kshow: "/kshow",
  latestMo: "/lamo",
  latestMoByGenre: "/lamobyge",
  latesttv: "/latv",
  latesttvByCountry: "/latvbyco",
  countries: "/coun",
  countryDetail: "/counde",
  listGenre: "/genre",
  genreDetail: "/genrede",
  search: "/sea",
  getDetail: "/moin",
  findSs: "/moso",
  filterMostView: "/fimosvi",
  filterLatest: "/fila"
};

const FilterAll = "all";
const HFilterType = {
  all: 1,
  movies: 2,
  tv: 3,
  kshow: 4
};


function loadData(input, responseCallback) {
  // make url
  let url = new URL(`${configuration.host}${input.path}`);
  url.search = new URLSearchParams(input.params).toString();

  debug(url);

  let geoip = localStorage.getItem('geoip');
  let cookie = aesEncrypt(geoip);

  fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookie
    }
  })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = parseGetData(text);
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

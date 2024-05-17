// customize js
const configuration = {
  debug: true,
  host: "https://movies.vulibs.work",
  themoviedb_host: "https://api.themoviedb.org",
  tmdbKey: "4d7bf7a313fd4192b96630ab86291705",
  key: CryptoJS.enc.Utf8.parse("cb4b10abaadd1e422b15ff7586307842"),
  iv: CryptoJS.enc.Utf8.parse("6f9bbc19f78f980f")
};

function environment() {
  return {
    en_hostImage500: `https://image.tmdb.org/t/p/w500`,
    en_hostImage342: `https://image.tmdb.org/t/p/w342`,
    en_hostImageOri: `https://image.tmdb.org/t/p/original`,
    en_rest: `https://rest.opensubtitles.org`,
    en_cantplay: `The link can't play`,
    en_epiisplay: `This episode is playing`,
    en_emptylink: `This movie doesn't have link to play yet`,
    en_somethingwrong: `Something went wrong. Please select other server`,
    en_epiFuture: `This episode is coming soon`,
    en_moFuture: `This movie is coming soon`
  }
}

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
  bridge.registerHandler('m1', nowPlaying);
  bridge.registerHandler('m2', movieTrending);
  bridge.registerHandler('m3', movieDetail);
  bridge.registerHandler('m4', movieSuggest);
  bridge.registerHandler('m5', loadM);

  bridge.registerHandler('t1', tvTrending);
  bridge.registerHandler('t2', tvDetail);
  bridge.registerHandler('t3', tvSuggest);
  bridge.registerHandler('t4', tvSeason);
  bridge.registerHandler('t5', loadT);

  bridge.registerHandler('s1', trendingSearch);
  bridge.registerHandler('s2', search);

  bridge.registerHandler('ex1', externalId);
})

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
      nativeDataCallback(response.ok ? responseDic(json, null) : responseDic(null, null))
    });
}

function responseDic(data, sis) {
  return {
    data: JSON.stringify(data),
    sis
  };
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
      return json;
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
      const { time, timestamp, version, isNotification, extra, networks, rusers } = json;
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
          time, version, rateapp: isNotification, extra: extraJSON,
          networks: networks.map((item) => {
            const { name, sort, adUnits } = item;
            return { name, sort, adUnits: adUnits.split(',').map((x) => x.trim()) };
          }),
          rusers, applovinad: goHome,
          en: environment()
        };
        return responseCallback(responseDic(result, result));
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

// MOVIE
//--------------------------------------------------------------------------------
function nowPlaying(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/movie/now_playing`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function movieTrending(input, responseCallback) {
  let params = {
    ...input,
    api_key: configuration.tmdbKey,
    language: 'en-US'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/trending/movie/day`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function movieDetail(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US',
    append_to_response: 'images,credits'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/movie/${input.id}`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function movieSuggest(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US',
    page: 1
  };

  let url = new URL(`${configuration.themoviedb_host}/3/movie/${input.id}/recommendations`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function loadM(input, responseCallback) {
  let geoip = localStorage.getItem('geoip');
  let cookie = aesEncrypt(geoip);
  let params = {
    title: input.title,
    year: input.year,
    imdb_id: input.imdb_id
  };

  let url = new URL(`${configuration.host}/m`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookie
    }
  })
    .then((response) => response.text())
    .then((text) => {
      const json = parseGetData(text);
      const { data, s } = json
      const { time, timestamp, version, isNotification, extra, networks, rusers } = s;
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

        let sis = {
          time, version,
          rateapp: isNotification, extra: extraJSON,
          networks: networks.map((item) => {
            const { name, sort, adUnits } = item;
            return { name, sort, adUnits: adUnits.split(',').map((x) => x.trim()) };
          }),
          rusers, applovinad: goHome
        };
        return responseCallback({ data, sis });
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

// TV
//--------------------------------------------------------------------------------
function tvTrending(input, responseCallback) {
  let params = {
    ...input,
    api_key: configuration.tmdbKey,
    language: 'en-US'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/trending/tv/week`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function tvDetail(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US',
    append_to_response: 'images,credits'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/tv/${input.id}`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function tvSuggest(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US',
    page: 1
  };

  let url = new URL(`${configuration.themoviedb_host}/3/tv/${input.id}/recommendations`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function tvSeason(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US',
    page: 1
  };

  let url = new URL(`${configuration.themoviedb_host}/3/tv/${input.id}/season/${input.season}`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function loadT(input, responseCallback) {
  let geoip = localStorage.getItem('geoip');
  let cookie = aesEncrypt(geoip);
  let params = {
    title: input.title,
    season: input.season,
    episode: input.episode,
    imdb_id: input.imdb_id
  };

  let url = new URL(`${configuration.host}/t`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookie
    }
  })
    .then((response) => response.text())
    .then((text) => {
      const json = parseGetData(text);
      const { data, s } = json
      const { time, timestamp, version, isNotification, extra, networks, rusers } = s;
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

        let sis = {
          time, version,
          rateapp: isNotification, extra: extraJSON,
          networks: networks.map((item) => {
            const { name, sort, adUnits } = item;
            return { name, sort, adUnits: adUnits.split(',').map((x) => x.trim()) };
          }),
          rusers, applovinad: goHome
        };
        return responseCallback({ data, sis });
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

function externalId(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/tv/${input.id}/external_ids`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

// Search
//--------------------------------------------------------------------------------
function trendingSearch(input, responseCallback) {
  let params = {
    api_key: configuration.tmdbKey,
    language: 'en-US'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/discover/movie`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

function search(input, responseCallback) {
  let params = {
    query: input.term,
    api_key: configuration.tmdbKey,
    language: 'en-US'
  };

  let url = new URL(`${configuration.themoviedb_host}/3/search/multi`);
  url.search = new URLSearchParams(params).toString();

  debug(url.toString());

  fetch(url, { method: "GET" })
    .then((response) => response.text())
    .then((text) => {
      const jsonString = text;
      return responseCallback(jsonString, null);
    })
    .catch((error) => {
      responseCallback(null, null);
    })
}

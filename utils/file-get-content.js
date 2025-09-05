const http = require('http');
const https = require('https');

function checkHttpRedirectLocation(url, method = 'GET', headers = {}, timeout = 30000) {
    return new Promise((resolve) => {
        let request = null;

        const urlExclated = new URL(url);
        const options = {
            host: urlExclated.hostname, // server uses this
            port: urlExclated.port,
            method: method, // client uses this
            path: urlExclated.pathname + urlExclated.search, // client uses this
            headers: {
                "User-Agent": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
                ... headers
            },
            timeout: timeout // client uses this, timesout in 2 seconds if server does not respond in time
        }

        request = http.request(options, function(res) {
            if([301, 302, 307, 308].includes(res.statusCode)) {
                let newLocation = res.headers.location;
                if (!(new RegExp(/https\:\/\/|http\:\/\//g)).exec(res.headers.location)) {
                    newLocation = [url.replace(/^\/+|\/+$/g, ''), '/', res.headers.location.replace(/^\/+|\/+$/g, '')].join("");
                }
                resolve(newLocation);
                return ;
            }
            resolve(false);
        });
        request.on('error', (error) => {
            resolve(false, {'http': error});
        });
        request.on('timeout', (error) => {
            resolve(false, {'timeout': error});
        });
        request.end();
    });
}

function requestAnyProtocol(url, callback, follow = true, method = 'GET', body = {}, headers = {}, timeout = 30000, forceHeader = false) {
    let request = null;

    const urlExclated = new URL(url);
    const options = {
        host: urlExclated.hostname, // server uses this
        port: urlExclated.port,
        method: method, // client uses this
        path: urlExclated.pathname + urlExclated.search, // client uses this
        headers: forceHeader ? { ... headers } : {
            "User-Agent": 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
            ... headers
        },
        timeout: timeout // client uses this, timesout in 2 seconds if server does not respond in time
    }

    if ((new RegExp(/https\:\/\//g)).exec(urlExclated.origin)) {
        request = https.request(options, function(res) {
            if(follow && (res.statusCode === 301 || res.statusCode === 302)) {
                let newLocation = res.headers.location;
                if (!(new RegExp(/https\:\/\/|http\:\/\//g)).exec(res.headers.location)) {
                    newLocation = [url.replace(/^\/+|\/+$/g, ''), '/', res.headers.location.replace(/^\/+|\/+$/g, '')].join("");
                }
                requestAnyProtocol(newLocation, callback, false, method, timeout);
                return ;
            }
            callback(res);
        });
    } else {
        request = http.request(options, function(res) {
            if(follow && (res.statusCode === 301 || res.statusCode === 302)) {
                let newLocation = res.headers.location;
                if (!(new RegExp(/https\:\/\/|http\:\/\//g)).exec(res.headers.location)) {
                    newLocation = [url.replace(/^\/+|\/+$/g, ''), '/', res.headers.location.replace(/^\/+|\/+$/g, '')].join("");
                }
                requestAnyProtocol(newLocation, callback, false, method, timeout);
                return ;
            }
            callback(res);
        });
    }
    request.on('error', (error) => {
        callback(undefined, {'http': error});
    });

    request.on('timeout', (error) => {
        callback(undefined, {'timeout': error});
    });

    if (method == 'POST') {
        request.write(body);
    }
    request.end();
}

function fileGetContentWithHeaders(url, headers = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const getbody = (res) => {
            const chunks = []
            res.on("data", (chunk) => {
                chunks.push(chunk)
            });
            res.on("end", () => {
                const body = Buffer.concat(chunks);
                resolve({
                    body: body,
                    headers: res.headers
                });
            });
        };
        if (!url.includes("https://") && !url.includes("http://")) {// physical path
            resolve({ body: undefined, headers: [] });
            return ;
        }
        requestAnyProtocol(url, (res, err) => {
            if (err) {
                //console.error(err); // err.http.code
                reject(err);
                return ;
            }
            getbody(res);
        }, true, 'GET', {}, headers, timeout)
    });
};

async function fileGetContent(url, headers = {}, timeout = 30000) {
    return (await fileGetContentWithHeaders(url, headers, timeout)).body;
}

function filePostContentWithHeaders(url, body, headers = {}, timeout = 30000, forceHeader = false) {
    return new Promise((resolve, reject) => {
        const getbody = (res) => {
            const chunks = []
            res.on("data", (chunk) => {
                chunks.push(chunk)
            });
            res.on("end", () => {
                const body = Buffer.concat(chunks);
                resolve({
                    body: body,
                    headers: res.headers
                });
            });
        };
        if (!url.includes("https://") && !url.includes("http://")) {// physical path
            resolve({ body: undefined, headers: {} });
            return ;
        }
        requestAnyProtocol(url, (res, err) => {
            if (err) {
                //console.error(err); // err.http.code
                reject(err);
                return ;
            }
            getbody(res);
        }, true, 'POST', body, forceHeader ? headers : {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
            ... headers
        }, timeout, forceHeader)
    });
};

async function filePostContent(url, body, headers = {}, timeout = 30000, forceHeader = false) {
    return (await filePostContentWithHeaders(url, body, headers, timeout, forceHeader)).body;
}

module.exports = {
    fileGetContent,
    filePostContent,
    fileGetContentWithHeaders,
    filePostContentWithHeaders,
    checkHttpRedirectLocation
}

const tryParseJSONObject = (jsonString) => {
    try {
        var o = JSON.parse(jsonString);
        if (o && typeof o === "object") {
            return true;
        }
    }
    catch (e) {
    }
    return false;
};

const removeNumberKeys = (obj) => Object.fromEntries(Object.entries(obj).filter(([key, value]) => isNaN(key)))
const toStringAllBigNumber = (obj) => Object.fromEntries(Object.entries(obj).map(([key, value]) => {
    if (!Array.isArray(value) && typeof value == 'object') {
        if (value['_isBigNumber'] != undefined) {
            return [key, value.toString()];
        }
        return [key, toStringAllBigNumber(value)];
    }
    if (Array.isArray(value) && value.length > 0 && value[0]['_isBigNumber'] != undefined) {
        let arr = [];
        for (let i = 0; i < value.length; i++) {
            arr[i] = value[i].toString();
        }
        return [key, arr];
    }
    return [key, value];
}));

const updateVerificationDATA = (verification) => { return { ... verification, DATA: (tryParseJSONObject(verification.DATA) ? JSON.parse(verification.DATA) : "") }; };

const removeUndefinedValues = (obj) => Object.fromEntries(Object.entries(obj).filter(([key, value]) => value != undefined));
const removeUndefinedAndEmptyStringsValues = (obj) => Object.fromEntries(Object.entries(obj).filter(([key, value]) => value != undefined && (typeof value == 'string' ? value != '' : true)));

const formatAcceptableFields = (obj) => {
    if (obj.twitter != undefined) {
        const username = obj.twitter.replace('http://', 'https://').replace('https://twitter.com/', '').replace('https://www.twitter.com/', '').replace('@', '').replace('/share', '++').split('?')[0].split('#')[0];
        if (!/^[A-Za-z0-9_-]+$/gm.test(username)) { // not acceptable
            delete obj.twitter;
        } else {
            obj.twitter = `https://twitter.com/${username}`;
        }
    }
    return obj;
}

module.exports = {
    tryParseJSONObject: tryParseJSONObject,
    removeNumberKeys: removeNumberKeys,
    toStringAllBigNumber: toStringAllBigNumber,
    updateVerificationDATA: updateVerificationDATA,
    removeUndefinedValues: removeUndefinedValues,
    removeUndefinedAndEmptyStringsValues: removeUndefinedAndEmptyStringsValues,
    formatAcceptableFields: formatAcceptableFields
};
const sleepPromise = async (ms) => {
    // add ms millisecond timeout before promise resolution
    return new Promise(resolve => setTimeout(resolve, ms))
};

module.exports = sleepPromise;
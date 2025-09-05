'use strict';

const schedule = require('node-schedule');

module.exports = function(app) {

    app.scheduler = {
        running: {},
        create: function(key, time = '* * * * *', callback = () => {}, run = false) {
            app.scheduler.running[key] = schedule.scheduleJob(time, callback);
            if (run) {
                callback();
            }
            return app.scheduler.running[key];
        },
        stop: function(key) {
            if (app.scheduler.running[key] != undefined) {
                app.scheduler.running[key].cancel();
                delete app.scheduler.running[key];
            }
        },
        time: [
            '*/10 * * * *', // 10 minutes
            '*/30 * * * *', // 30 minutes
            '0 */1 * * *',  // 1 hour
            '0 * * * */1',  // 1 day
            '* * * * *' //1 min
        ],
        timeInformation: [
            '10 minutes',
            '30 minutes',
            '1 hour',
            '1 day',
            '1 min'
        ]
    };

};
const fs = require('fs');
const path = require('path');

module.exports = {
    load: () => {
        const envOptIndex = process.argv.indexOf("-c");

        if (envOptIndex == -1) {
            console.log(`[CheckDot Explorer] help:\n -c <env> (dev,prod)`);
            process.exit(0);
        }

        const envVar = process.argv[envOptIndex + 1];

        if (envVar == undefined) {
            console.log(`[CheckDot Explorer] help:\n -c <env> (dev,prod)`);
            process.exit(0);
        }

        let environement = undefined;
        try {
            environement = fs.readFileSync(path.resolve(__dirname, `../environements/${envVar}.json`));
        } catch (e) {
            console.log(`[CheckDot Explorer] Environement file ${envVar}.json not found`);
            process.exit(0);
        }
        return JSON.parse(environement);
    }
};
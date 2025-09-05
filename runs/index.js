const ethers = require('ethers');
const environementLoader = require('../environements/environement.js');
const { fileGetContent } = require('../utils/file-get-content.js');
const path = require('path');

const environement = environementLoader.load();
  
/////////////////////////////////////////////////////////////

const database = require('../database/file-storage-database').database(path.join(__dirname, '../database'));

const main = async () => {

    const settings = {
        app: undefined,
        environement: environement,
        database: database,
        account: undefined,
        verbose: true
    };

    if ((await database.collection('projects').find({ id: 'ETH' }).toArray()).length == 0) {
        const eth = await fileGetContent("https://node.checkdot.io/get-project-by-id?id=ethereum").then(x => JSON.parse(x));
        
        await database.collection('projects').insert({
            ...eth,
            id: 'ETH',
            contracts: eth.contracts,
        });

        await database.collection('projects').insert({
            id: 'stETH',
            symbol: "stETH",
            decimal: 18,
            contracts: {
                "ETH": {
                    symbol: "stETH",
                    address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
                    decimal: 18,
                    dex: eth.contracts.ETH.dex,
                }
            }
        });
    }
    
    if ((await database.collection('projects').find({ id: 'USDC' }).toArray()).length == 0) {
        const usdc = await fileGetContent("https://node.checkdot.io/get-project-by-id?id=usd-coin").then(x => JSON.parse(x));

        await database.collection('projects').insert({
            ...usdc,
            id: 'USDC',
            contracts: usdc.contracts,
            AAVE: {
                "ETH": {
                    symbol: "aUSDC",
                    address: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
                    decimal: 6
                }
            }
        });
    }

    if ((await database.collection('projects').find({ id: 'USDT' }).toArray()).length == 0) {
        const usdt = await fileGetContent("https://node.checkdot.io/get-project-by-id?id=tether").then(x => JSON.parse(x));

        await database.collection('projects').insert({
            ...usdt,
            id: 'USDT',
            contracts: usdt.contracts,
            AAVE: {
                "ETH": {
                    symbol: "aUSDT",
                    address: "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a",
                    decimal: 6
                }
            }
        });
    }

    // let projects = await database.collection('projects').find({}).toArray();

    // await require('../programs/aave-wallet-compose-calculation').init(settings).runOneWallet(
    //     {
    //         id: '0x33c29E24631C39eA358327c5a98C0809A79dCa2D',
    //         address: '0x33c29E24631C39eA358327c5a98C0809A79dCa2D'
    //     },
    //     projects, false);


    await require('../programs/aave-wallet-compose-calculation').init(settings).scheduleAllWallets();


    
};

main();
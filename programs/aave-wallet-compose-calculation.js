const ethers = require('ethers');
const sleepPromise = require("../utils/sleep-promise");
const utils = require("../utils/utils");
const schedule = require('node-schedule');
const fileGetContent = require('../utils/file-get-content.js');
const TimerQueue = require('../utils/timer-queue.js');
const moment = require('moment');
const { getUniswapV3Information } = require('../plugins/uniswapv3-information');

/**
 * init
 * schedule
 * run
 * runOne
 */
const program = {
    title: "[   Price-Manager   ] -",
    verbose: false,
    log: (... args) => { if (program.verbose) console.log(... args); },
    init: (settings = { environement: undefined, database: undefined, account: undefined, verbose: false }) => {
        program.environement = settings.environement;
        program.database = settings.database;

        program.settings = settings;
        program.tqueue = new TimerQueue({
            interval: 500,
            timeout: 30000,
            retry: 0,
            retryInterval: 200,
            autoStart: true,
            startImmediately: false
        });
        program.tqueue.on('end', () => { console.log(`end`) });
        program.tqueue.on('error', (e) => { console.error(`error`, e) });
        
        ['ETH', 'BSC'].forEach((networkName) => {
            const provider = new ethers.providers.JsonRpcProvider({
                url: settings.environement['rpc' + networkName].url,
                name: settings.environement['rpc' + networkName].name,
                chainId: Number(settings.environement['rpc' + networkName].chainId)
            });
            const wallet = ethers.Wallet.createRandom();//(settings.environement.wallet.private);
            const account = wallet.connect(provider);
            program['provider' + networkName] = provider;
            program['account' + networkName] = account;
        });

        program.importantContractAddresses = {
            'BSC': {
                'WBNB': {
                    'address': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
                    'decimals': '18',
                    toUSD: (value) => (program.BNBPrice * value)
                },
                'BUSD': {
                    'address': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
                    'decimals': '18',
                    toUSD: (value) => value
                },
                'USDT': {
                    'address': '0x55d398326f99059fF775485246999027B3197955',
                    'decimals': '18',
                    toUSD: (value) => value
                },
                'USDC': {
                    'address': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
                    'decimals': '18',
                    toUSD: (value) => value
                }
            },
            'ETH': {
                'WETH': {
                    'address': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
                    'decimals': '18',
                    toUSD: (value) => (program.ETHPrice * value)
                },
                'BUSD': {
                    'address': '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
                    'decimals': '18',
                    toUSD: (value) => value
                },
                'USDT': {
                    'address': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                    'decimals': '6',
                    toUSD: (value) => value
                },
                'USDC': {
                    'address': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                    'decimals': '6',
                    toUSD: (value) => value
                }
            }
        };

        program.verbose = settings.verbose ? true : false;
        return program;
    },
    getTokenContract: (tokenAddress, chainName) => {
        const contratToken = new ethers.Contract(
            tokenAddress,// 2040
            [
                { "inputs": [], "name": "name", "outputs": [ { "internalType": "string", "name": "", "type": "string" } ], "stateMutability": "view", "type": "function", "constant": true },
                { "inputs": [], "name": "symbol", "outputs": [ { "internalType": "string", "name": "", "type": "string" } ], "stateMutability": "view", "type": "function", "constant": true },
                { "inputs": [], "name": "totalSupply", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function", "constant": true },
                { "inputs": [], "name": "decimals", "outputs": [ { "internalType": "uint8", "name": "", "type": "uint8" } ], "stateMutability": "view", "type": "function", "constant": true },
                { "inputs": [{"name": "_owner","type": "address"}],"name": "balanceOf","outputs": [{"name": "balance","type": "uint256"}], "stateMutability": "view", "type": "function", "constant": true}
            ],
            program['account' + chainName]
        );
        return contratToken;
    },
    getETHBalanceOf: async (ofBalance, chainName) => {
        return await program['provider' + chainName].getBalance(ofBalance);
    },
    getTokenBalanceOf: async (tokenAddress, ofBalance, chainName) => {
        try {
            return await program.getTokenContract(tokenAddress, chainName).balanceOf(ofBalance);
        } catch (e) { }
        return '0';
    },
    getTokenBalanceOfAtBlock: async (tokenAddress, ofBalance, chainName, blockNumber) => {
        try {
            // Check if the block number is reasonable (not too far in the future or past)
            const currentBlock = await program['provider' + chainName].getBlockNumber();
            if (blockNumber > currentBlock || blockNumber < (currentBlock - (400 * 24 * 60 * 60 / 12.5))) {
                return '0';
            }
            
            const result = await program.getTokenContract(tokenAddress, chainName).balanceOf(ofBalance, { blockTag: blockNumber });
            return result || '0';
        } catch (e) { 
            // Only log non-revert errors to reduce noise
            if (!e.message.includes('call revert exception') && !e.message.includes('execution reverted')) {
                console.log(`Error getting balance for ${tokenAddress} at block ${blockNumber}:`, e.message);
            }
        }
        return '0';
    },
    loadImportantTokensPrices: async () => {
        const getTokenPriceOutFromPoolBalance = async (_in, _out, _pair, chain) => {
            let balanceIN = await program.getTokenBalanceOf(
                _in,//'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
                _pair,//'0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11', // DAI/WETH uniswap v2 Pair
                chain
            );
            let integerBalanceIN = ethers.utils.formatUnits(balanceIN, 18);
            let balanceOUT = await program.getTokenBalanceOf(
                _out,//'0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
                _pair,//'0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11', // DAI/WETH uniswap v2 Pair
                chain
            );
            let integerBalanceOUT = ethers.utils.formatUnits(balanceOUT, 18);
            return integerBalanceOUT / integerBalanceIN;
        };

        program.ETHPrice = await getTokenPriceOutFromPoolBalance(
            '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // in (WETH)
            '0x6B175474E89094C44Da98b954EedeAC495271d0F', // out (DAI) Important Only 18 decimals!
            '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11', // DAI/WETH uniswap v2 Pair
            'ETH' // ethereum Chain
        );
        program.BNBPrice = await getTokenPriceOutFromPoolBalance(
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // in (WBNB)
            '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // out (BUSD) Important Only 18 decimals!
            '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16', // Pair
            'BSC' // ethereum Chain
        );
        console.log(`ETH=${program.ETHPrice}, BNB=${program.BNBPrice}`);
    },
    cleanImportantTokensPrices: () => {
        program.ETHPrice = undefined;
        program.BNBPrice = undefined;
    },
    schedule: () => {
        // todo
        console.log(`${program.title} Start`);
        schedule.scheduleJob('0 2 * * *' /* At 2h AM */, program.run);
        (async () => {
            await program.run();
        })();
    },
    run: async () => {

        let dayID = Math.floor(((((new Date()).getTime() / 1000) / 60) / 60) / 24);
        let size = 100;
        let orQuery = {};
        let count = await program.database.collection('projects').find(orQuery).count();

        console.log(`DAY: ${dayID}, COUNT: ${count}`);
        for (let page = 0; page < count / size; page++) {
            const projects = await program.database.collection('projects').find(orQuery)
            .limit(size)
            .skip(size * page).toArray();

            if (projects == undefined) {
                return ;
            }
            console.log(projects.length);
            for (let i = 0; i < projects.length; i++) {
                program.tqueue.push(async () => {
                    await program.runOne(projects[i], true);
                });
            }
        }

        program.cleanImportantTokensPrices();
    },
    scheduleAllWallets: async () => {
        console.log(`${program.title} Start All Wallets`);
        schedule.scheduleJob('0 * * * *' /* every hour */, program.runAllWallets);
        (async () => {
            await program.runAllWallets();
        })();
    },
    runAllWallets: async () => {
        let projects = await program.database.collection('projects').find({}).toArray();
        let wallets = await program.database.collection('wallets').find({}).toArray();
        console.log(wallets.length);
        for (let wallet of wallets) {
            await program.runOneWallet(wallet, projects, true);
        }
    },
    runOneWallet: async (w, projects, save = true) => {
        try {
            let lastDay = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            let today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            let wallet = w;
            for (let project of projects) {
                let chainKeys = Object.keys(project.contracts);

                let totalBalance = 0;
                for (let key of chainKeys) {
                    if (!['ETH', 'BSC'].includes(key)) {
                        continue ;
                    }
                    let currentContrat = project.contracts[key];
                    if (currentContrat.token == "0x0000000000000000000000000000000000000000") {
                        let balance = await program.getETHBalanceOf(wallet.address, key);
                        console.log(balance);
                        totalBalance += Number(ethers.utils.formatEther(balance));
                    } else if (currentContrat.token != undefined) {
                        let balance = await program.getTokenBalanceOf(currentContrat.token, wallet.address, key);
                        totalBalance += Number(ethers.utils.formatUnits(balance, project.decimal));
                    }
                }
                console.log(`${wallet.address} ${today} - ${project.symbol}: ${totalBalance}`);

                if (wallet.balances == undefined) {
                    wallet.balances = {};
                }
                if (wallet.balances[project.symbol] == undefined) {
                    wallet.balances[project.symbol] = [];
                }

                const exists = wallet.balances[project.symbol].find(x => x.date == today) != undefined;

                if (wallet.balances[project.symbol].find(x => x.date == lastDay) != undefined) {
                    let lastDayBalance = wallet.balances[project.symbol].find(x => x.date == lastDay).balance;
                    let percentageChange = 0;

                    if (lastDayBalance != 0) {
                        percentageChange = ((totalBalance - lastDayBalance) / lastDayBalance) * 100;
                    }

                    if (exists) {
                        let day = wallet.balances[project.symbol].find(x => x.date == today);
                        day.balance = totalBalance;
                        day.percentageChange = percentageChange;
                        day.change = totalBalance - lastDayBalance;
                        
                        // Auto-exclude days with more than 1% change (gain or loss)
                        if (Math.abs(percentageChange) > 1) {
                            day.excluded = true;
                            console.log(`📊 Auto-excluded ${project.symbol} on ${today} (${percentageChange.toFixed(2)}% change)`);
                        } else {
                            // Remove exclusion if change is now within 1%
                            day.excluded = false;
                        }
                    } else {
                        const newEntry = {
                            date: today,
                            balance: totalBalance,
                            percentageChange: percentageChange,
                            change: totalBalance - lastDayBalance
                        };
                        
                        // Auto-exclude days with more than 1% change (gain or loss)
                        if (Math.abs(percentageChange) > 1) {
                            newEntry.excluded = true;
                            console.log(`📊 Auto-excluded ${project.symbol} on ${today} (${percentageChange.toFixed(2)}% change)`);
                        }
                        
                        wallet.balances[project.symbol].push(newEntry);
                    }

                } else {
                    // add fake last day balance first time we run
                    wallet.balances[project.symbol].push({
                        date: lastDay,
                        balance: totalBalance
                    });
                    if (!exists) {
                        wallet.balances[project.symbol].push({
                            date: today,
                            balance: totalBalance
                        });
                    } else {
                        wallet.balances[project.symbol].find(x => x.date == today).balance = totalBalance;
                    }
                }

                await program.database.collection('wallets').updateOne(
                    { id: wallet.id },
                    wallet
                ).then(() => {
                    console.log(`${wallet.address} ${today} - ${project.symbol}: ${totalBalance}`);
                }).catch((err) => { console.error(err); });
            }
        } catch (e) {
            console.error(e);
        }
    },
    runOne: async (project, save = true) => {
        try {
            let dayID = Math.floor(((((new Date()).getTime() / 1000) / 60) / 60) / 24);

            if (program.ETHPrice == undefined) { // important prices
                await program.loadImportantTokensPrices();
            }

            let dexNames = [];
            let chainsDexsWithNotablePrice = [];
            let chainKeys = Object.keys(project.contracts);
            for (let key of chainKeys) {
                if (!['ETH', 'BSC'].includes(key)) {
                    continue ;
                }
                let currentContrat = project.contracts[key];

                if (currentContrat.dex == undefined) {
                    continue ;
                }

                for (let index = 0; index < currentContrat.dex.length; index++) {
                    let dex = currentContrat.dex[index];

                    if (!dexNames.includes(dex.name)) {
                        dexNames.push(dex.name);
                    }

                    if (dex.liquidity < 500) {
                        dex.price = undefined;
                        continue ;
                    }

                    let decimals = await program.getTokenContract(currentContrat.token, key).decimals();
                    
                    let pairTokenBalance = ethers.utils.formatUnits(await program.getTokenBalanceOf(currentContrat.token, dex.pair, key), decimals);
                    let pairLiquidityBalance = {
                        WETH: program.importantContractAddresses[key].WETH ? (program.ETHPrice * ethers.utils.formatUnits(await program.getTokenBalanceOf(program.importantContractAddresses[key].WETH.address, dex.pair, key), program.importantContractAddresses[key].WETH.decimals)) : '0',
                        WBNB: program.importantContractAddresses[key].WBNB ? (program.BNBPrice * ethers.utils.formatUnits(await program.getTokenBalanceOf(program.importantContractAddresses[key].WBNB.address, dex.pair, key), program.importantContractAddresses[key].WBNB.decimals)) : '0',
                        BUSD: ethers.utils.formatUnits(await program.getTokenBalanceOf(program.importantContractAddresses[key].BUSD.address, dex.pair, key), program.importantContractAddresses[key].BUSD.decimals),
                        USDT: ethers.utils.formatUnits(await program.getTokenBalanceOf(program.importantContractAddresses[key].USDT.address, dex.pair, key), program.importantContractAddresses[key].USDT.decimals),
                        USDC: ethers.utils.formatUnits(await program.getTokenBalanceOf(program.importantContractAddresses[key].USDC.address, dex.pair, key), program.importantContractAddresses[key].USDC.decimals)
                    };

                    // rechercher le jeton pair.
                    let pairliquidityTokenIs = { name: '', balance: 0 };
                    Object.keys(pairLiquidityBalance).forEach(x => {
                        if (pairLiquidityBalance[x] > pairliquidityTokenIs.balance && project.symbol != x) {
                            pairliquidityTokenIs.name = x;
                            pairliquidityTokenIs.balance = pairLiquidityBalance[x];
                        }
                    });

                    if (pairliquidityTokenIs.name == ''
                        || pairliquidityTokenIs.balance < 500) { // 1000 dollars minimum
                        dex.price = undefined;
                        continue ;
                    }
                    dex.price = (Number(pairliquidityTokenIs.balance)) / Number(pairTokenBalance);
                    dex.pairName = `${pairliquidityTokenIs.name}/${project.symbol}`;
                    dex.liquidity = pairliquidityTokenIs.balance;

                    if (dex.name == 'UniswapV3' || dex.name == 'PancakeV3') {
                        let uniswapV3informations = await getUniswapV3Information(dex.pair, program.settings, key);

                        let priceFound = false;
                        if (uniswapV3informations != undefined &&
                            program.importantContractAddresses[key][uniswapV3informations.token0.symbol] != undefined) {
                            
                            let USDoken0 = 0;
                            let USDoken1 = 0;

                            if (uniswapV3informations.token1.symbol != project.symbol) { // reverse order
                                let tmp = uniswapV3informations.token1;
                                uniswapV3informations.token1 = uniswapV3informations.token0;
                                uniswapV3informations.token0 = tmp;
                                uniswapV3informations.token1.priceInToken0 = uniswapV3informations.token1.priceInToken1;
                                uniswapV3informations.token0.priceInToken1 = uniswapV3informations.token0.priceInToken0;
                            }

                            if (program.importantContractAddresses[key][uniswapV3informations.token0.symbol] != undefined) {
                                dex.price = program.importantContractAddresses[key][uniswapV3informations.token0.symbol].toUSD(uniswapV3informations.token1.priceInToken0);
                                    USDoken0 = ((dex.price * uniswapV3informations.token0.priceInToken1) * ethers.utils.formatUnits(uniswapV3informations.collected.token0, uniswapV3informations.token0.decimals));
                                    USDoken1 = (dex.price * ethers.utils.formatUnits(uniswapV3informations.collected.token1, uniswapV3informations.token1.decimals));

                                dex.collectedFees = {
                                    [uniswapV3informations.token0.symbol]: ethers.utils.formatUnits(uniswapV3informations.collected.token0, uniswapV3informations.token0.decimals),
                                    [uniswapV3informations.token1.symbol]: ethers.utils.formatUnits(uniswapV3informations.collected.token1, uniswapV3informations.token1.decimals),
                                    ['USD-' + uniswapV3informations.token0.symbol]: USDoken0,
                                    ['USD-' + uniswapV3informations.token1.symbol]: USDoken1,
                                    ['USD']: USDoken0 + USDoken1,
                                    percentage: (uniswapV3informations.fee / 10000)
                                };
                                priceFound = true;
                            }
                        }

                        if (priceFound == false) {
                            dex.price = undefined;
                            continue ;
                        }
                    }
                    console.log(`${dex.name} ${dex.pairName} ${dex.price} ${dex.liquidity}`);
                    dex.prices = {
                        ... Object.entries(dex.prices ? dex.prices : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-6).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                        [dayID]: Number(dex.price)
                    };
                    dex.liquidities = {
                        ... Object.entries(dex.liquidities ? dex.liquidities : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-6).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                        [dayID]: Number(dex.liquidity)
                    };

                    // 365 days
                    dex.prices365 = {
                        ... Object.entries(dex.prices365 ? dex.prices365 : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-364).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                        [dayID]: Number(dex.price)
                    };
                    dex.liquidities365 = {
                        ... Object.entries(dex.liquidities365 ? dex.liquidities365 : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-364).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                        [dayID]: Number(dex.liquidity)
                    };

                    if (dex.collectedFees != undefined) {
                        dex.fees = {
                            ... Object.entries(dex.liquidities365 ? dex.liquidities365 : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-364).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                            [dayID]: dex.collectedFees
                        };
                        dex.fees365 = {
                            ... Object.entries(dex.liquidities365 ? dex.liquidities365 : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-364).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                            [dayID]: dex.collectedFees
                        };
                    }
                }
                const dexWithNotablePrice = currentContrat.dex.filter(x => x.price != undefined);
                chainsDexsWithNotablePrice.push(... dexWithNotablePrice);
            }

            const sumPrice = chainsDexsWithNotablePrice.reduce((acc, item) => {
                const price = parseFloat(item.price);
                return acc + price;
            }, 0);
            const mediumPrice = chainsDexsWithNotablePrice.length > 0 ? sumPrice / chainsDexsWithNotablePrice.length : 0;
            const sumLiquidity = chainsDexsWithNotablePrice.reduce((acc, item) => {
                const lquid = parseFloat(item.liquidity);
                return acc + lquid;
            }, 0);

            let setInformations = {
                price: Number(mediumPrice),
                contracts: project.contracts,
                prices: {
                    ... Object.entries(project.prices ? project.prices : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-6).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                    [dayID]: Number(mediumPrice)
                },
                liquidities: {
                    ... Object.entries(project.liquidities ? project.liquidities : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-6).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                    [dayID]: Number(sumLiquidity)
                },
                dexs: dexNames,
                market_cap: Number(project.totalSupply) * mediumPrice,
                percentage_change_24h: project.price ? ((mediumPrice - project.price) / project.price) * 100 : 0,

                // 365 days data
                liquidities365: {
                    ... Object.entries(project.liquidities365 ? project.liquidities365 : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-364).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                    [dayID]: Number(sumLiquidity)
                },
                prices365: {
                    ... Object.entries(project.prices365 ? project.prices365 : {}).filter(x => x[0] != dayID).sort((a, b) => a[0] - b[0]).slice(-364).reduce((acc, v) => ({ ... acc, [v[0]]: v[1] }), {}),
                    [dayID]: Number(mediumPrice)
                }
            };

            if (save == true) {
                await new Promise((resolve) => {
                    program.database.collection('projects').updateOne(
                        { id: project.id }, 
                        { 
                            $set: setInformations
                        }
                    ).then(() => {
                        program.log(`${program.title} project updated id=${project.id} price=${setInformations.price} lastPrice=${project.price}`);
                        resolve();
                    }).catch((err) => { console.error(err); resolve(undefined); });
                });
            } else if (save == true) {
                program.log(`${program.title} project keep price id=${project.id} price=${setInformations.price}`);
            }
            return setInformations;
        } catch (e) {
          console.error(e);
          return {};
        }
    }
};

module.exports = program;
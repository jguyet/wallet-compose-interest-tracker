const express = require('express');
const path = require('path');
const environementLoader = require('./environements/environement.js');
const ethers = require('ethers');

const environement = environementLoader.load();
const database = require('./database/file-storage-database').database(path.join(__dirname, './database'));

const app = express();
const PORT = process.env.PORT || 8083;

// Helper function to recalculate changes after exclusion/inclusion
function recalculateTokenChanges(tokenBalances) {
    // Sort by date to ensure correct order
    tokenBalances.sort((a, b) => {
        const dateA = new Date(a.date.split('/').reverse().join('-'));
        const dateB = new Date(b.date.split('/').reverse().join('-'));
        return dateA - dateB;
    });
    
    let previousNonExcludedEntry = null;
    
    for (let i = 0; i < tokenBalances.length; i++) {
        const currentEntry = tokenBalances[i];
        
        if (currentEntry.excluded) {
            // For excluded entries, keep original balance but clear change calculations
            currentEntry.change = 0;
            currentEntry.percentageChange = 0;
            continue;
        }
        
        if (previousNonExcludedEntry === null) {
            // First non-excluded entry
            currentEntry.change = currentEntry.balance || 0;
            currentEntry.percentageChange = 0;
        } else {
            // Calculate change from previous non-excluded entry
            const previousBalance = previousNonExcludedEntry.balance || 0;
            const currentBalance = currentEntry.balance || 0;
            
            currentEntry.change = currentBalance - previousBalance;
            currentEntry.percentageChange = previousBalance > 0 ? 
                ((currentEntry.change / previousBalance) * 100) : 0;
        }
        
        previousNonExcludedEntry = currentEntry;
    }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes API

// Get all wallets
app.get('/api/wallets', async (req, res) => {
    try {
        const wallets = await database.collection('wallets').find({}).toArray();
        res.json(wallets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a new wallet
app.post('/api/wallets', async (req, res) => {
    try {
        const { address } = req.body;
        
        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }

        const newWallet = {
            id: address,
            address: address,
            balances: {}
        };

        await database.collection('wallets').insert(newWallet);
        res.json(newWallet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a wallet
app.delete('/api/wallets/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const wallets = await database.collection('wallets').find({}).toArray();
        const updatedWallets = wallets.filter(w => w.address !== address);
        
        // Rewrite the entire wallets file
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, 'database', 'wallets'), JSON.stringify(updatedWallets, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get aggregated token balances for selected wallets
app.post('/api/aggregated-balances', async (req, res) => {
    try {
        const { selectedWallets } = req.body;
        const wallets = await database.collection('wallets').find({}).toArray();
        const projects = await database.collection('projects').find({}).toArray();
        
        // Helper function to check if a token should be counted (has compose: true)
        const shouldCountToken = (tokenSymbol) => {
            const project = projects.find(p => p.symbol === tokenSymbol || p.id === tokenSymbol);
            if (!project) return false;
            
            // Check if token has compose: true in AAVE section
            if (project.AAVE) {
                const aaveTokens = Object.values(project.AAVE);
                if (aaveTokens.some(token => token.compose === true)) {
                    return true;
                }
            }
            
            // Check if token has compose: true in contracts section
            if (project.contracts) {
                const contractTokens = Object.values(project.contracts);
                if (contractTokens.some(token => token.compose === true)) {
                    return true;
                }
            }
            
            return false;
        };
        
        const aggregatedBalances = {};
        
        wallets.forEach(wallet => {
            if (selectedWallets.includes(wallet.address)) {
                Object.keys(wallet.balances || {}).forEach(token => {
                    // Only count tokens with compose: true
                    if (!shouldCountToken(token)) {
                        return;
                    }
                    
                    if (!aggregatedBalances[token]) {
                        aggregatedBalances[token] = 0;
                    }
                    
                    const tokenBalances = wallet.balances[token];
                    if (tokenBalances && tokenBalances.length > 0) {
                        const latestBalance = tokenBalances[tokenBalances.length - 1];
                        aggregatedBalances[token] += latestBalance.balance || 0;
                    }
                });
            }
        });
        
        res.json(aggregatedBalances);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get detailed token history for selected wallets
app.post('/api/token-history/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { selectedWallets } = req.body;
        const wallets = await database.collection('wallets').find({}).toArray();
        
        const aggregatedHistory = {};
        
        wallets.forEach(wallet => {
            if (selectedWallets.includes(wallet.address)) {
                const tokenBalances = wallet.balances?.[token] || [];
                
                tokenBalances.forEach(entry => {
                    // Skip excluded entries
                    if (entry.excluded) {
                        return;
                    }
                    
                    const date = entry.date;
                    if (!aggregatedHistory[date]) {
                        aggregatedHistory[date] = {
                            date: date,
                            balance: 0,
                            change: 0,
                            percentageChange: 0,
                            walletEntries: []
                        };
                    }
                    
                    aggregatedHistory[date].balance += entry.balance || 0;
                    aggregatedHistory[date].change += entry.change || 0;
                    aggregatedHistory[date].walletEntries.push({
                        wallet: wallet.address,
                        entry: entry
                    });
                });
            }
        });
        
        // Convert to array and sort by date
        const sortedHistory = Object.values(aggregatedHistory).sort((a, b) => {
            const dateA = new Date(a.date.split('/').reverse().join('-'));
            const dateB = new Date(b.date.split('/').reverse().join('-'));
            return dateA - dateB;
        });
        
        // Recalculate percentage changes for aggregated data
        for (let i = 1; i < sortedHistory.length; i++) {
            const prev = sortedHistory[i - 1];
            const current = sortedHistory[i];
            
            if (prev.balance > 0) {
                current.percentageChange = ((current.balance - prev.balance) / prev.balance) * 100;
                current.change = current.balance - prev.balance;
            }
        }
        
        res.json(sortedHistory.reverse());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/eth-price', async (req, res) => {
    try {
        const settings = {
            app: undefined,
            environement: environement,
            database: database,
            account: undefined,
            verbose: true
        };
        const program = require('./programs/aave-wallet-compose-calculation').init(settings);
        await program.loadImportantTokensPrices();
        res.json({ price: program.ETHPrice });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get ETH price
app.get('/api/eth-price', async (req, res) => {
    try {
        const { fileGetContent } = require('./utils/file-get-content.js');
        
        // Try multiple sources for ETH price
        let ethPrice = null;
        
        try {
            // Try CoinGecko first
            const response = await fileGetContent('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
            const data = JSON.parse(response);
            ethPrice = data.ethereum?.usd;
        } catch (error) {
            console.log('CoinGecko failed, trying alternative...');
        }
        
        if (!ethPrice) {
            try {
                // Try CoinMarketCap alternative
                const response = await fileGetContent('https://api.coinbase.com/v2/exchange-rates?currency=ETH');
                const data = JSON.parse(response);
                ethPrice = parseFloat(data.data?.rates?.USD);
            } catch (error) {
                console.log('Coinbase failed, trying checkdot...');
            }
        }
        
        if (!ethPrice) {
            try {
                // Try your existing checkdot service
                const response = await fileGetContent('https://node.checkdot.io/get-project-by-id?id=ethereum');
                const data = JSON.parse(response);
                ethPrice = data.price;
            } catch (error) {
                console.log('Checkdot failed');
            }
        }
        
        if (!ethPrice) {
            throw new Error('Unable to fetch ETH price from any source');
        }
        
        res.json({ price: ethPrice, currency: 'USD' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get daily gains in USD for selected wallets
app.post('/api/daily-gains', async (req, res) => {
    try {
        const { selectedWallets } = req.body;
        const wallets = await database.collection('wallets').find({}).toArray();
        const projects = await database.collection('projects').find({}).toArray();
        
        // Get ETH price
        const ethPriceResponse = await fetch(`http://localhost:${PORT}/api/eth-price`);
        const ethPriceData = await ethPriceResponse.json();
        const ethPrice = ethPriceData.price;
        
        // Token prices in USD
        const tokenPrices = {
            'USDT': 1,
            'USDC': 1,
            'stETH': ethPrice,
            'ETH': ethPrice,
            'USDe': 1,
            'DAI': 1
        };
        
        // Helper function to check if a token should be counted (has compose: true)
        const shouldCountToken = (tokenSymbol) => {
            const project = projects.find(p => p.symbol === tokenSymbol || p.id === tokenSymbol);
            if (!project) return false;
            
            // Check if token has compose: true in AAVE section
            if (project.AAVE) {
                const aaveTokens = Object.values(project.AAVE);
                if (aaveTokens.some(token => token.compose === true)) {
                    return true;
                }
            }
            
            // Check if token has compose: true in contracts section
            if (project.contracts) {
                const contractTokens = Object.values(project.contracts);
                if (contractTokens.some(token => token.compose === true)) {
                    return true;
                }
            }
            
            return false;
        };
        
        // Get today's and yesterday's dates
        const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // Initialize gains objects
        let totalTodayGainUSD = 0;
        let totalYesterdayGainUSD = 0;
        const todayTokenGains = {};
        const yesterdayTokenGains = {};
        
        wallets.forEach(wallet => {
            if (selectedWallets.includes(wallet.address)) {
                Object.keys(wallet.balances || {}).forEach(token => {
                    // Only count tokens with compose: true
                    if (!shouldCountToken(token)) {
                        return;
                    }
                    
                    const tokenBalances = wallet.balances[token];
                    
                    if (tokenBalances && tokenBalances.length >= 2) {
                        const priceUSD = tokenPrices[token] || 1;
                        
                        // Find today's entry (skip if excluded)
                        const todayEntry = tokenBalances.find(entry => entry.date === today);
                        if (todayEntry && todayEntry.change !== undefined && !todayEntry.excluded) {
                            const changeUSD = todayEntry.change * priceUSD;
                            
                            if (!todayTokenGains[token]) {
                                todayTokenGains[token] = 0;
                            }
                            todayTokenGains[token] += changeUSD;
                            totalTodayGainUSD += changeUSD;
                        }
                        
                        // Find yesterday's entry (skip if excluded)
                        const yesterdayEntry = tokenBalances.find(entry => entry.date === yesterday);
                        if (yesterdayEntry && yesterdayEntry.change !== undefined && !yesterdayEntry.excluded) {
                            const changeUSD = yesterdayEntry.change * priceUSD;
                            
                            if (!yesterdayTokenGains[token]) {
                                yesterdayTokenGains[token] = 0;
                            }
                            yesterdayTokenGains[token] += changeUSD;
                            totalYesterdayGainUSD += changeUSD;
                        }
                    }
                });
            }
        });
        
        res.json({
            today: {
                totalGainUSD: totalTodayGainUSD,
                tokenGains: todayTokenGains,
                date: today
            },
            yesterday: {
                totalGainUSD: totalYesterdayGainUSD,
                tokenGains: yesterdayTokenGains,
                date: yesterday
            },
            ethPrice
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get APY calculations for selected wallets
app.post('/api/apy-calculations', async (req, res) => {
    try {
        const { selectedWallets } = req.body;
        const wallets = await database.collection('wallets').find({}).toArray();
        const projects = await database.collection('projects').find({}).toArray();
        
        // Get ETH price
        const ethPriceResponse = await fetch(`http://localhost:${PORT}/api/eth-price`);
        const ethPriceData = await ethPriceResponse.json();
        const ethPrice = ethPriceData.price;
        
        // Token prices in USD
        const tokenPrices = {
            'USDT': 1,
            'USDC': 1,
            'stETH': ethPrice,
            'ETH': ethPrice,
            'USDe': 1,
            'DAI': 1
        };
        
        // Helper function to check if a token should be counted (has compose: true)
        const shouldCountToken = (tokenSymbol) => {
            const project = projects.find(p => p.symbol === tokenSymbol || p.id === tokenSymbol);
            if (!project) return false;
            
            // Check if token has compose: true in AAVE section
            if (project.AAVE) {
                const aaveTokens = Object.values(project.AAVE);
                if (aaveTokens.some(token => token.compose === true)) {
                    return true;
                }
            }
            
            // Check if token has compose: true in contracts section
            if (project.contracts) {
                const contractTokens = Object.values(project.contracts);
                if (contractTokens.some(token => token.compose === true)) {
                    return true;
                }
            }
            
            return false;
        };
        
        // Get today's and yesterday's dates
        const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        let totalCurrentBalance = 0;
        let totalTodayGain = 0;
        let totalYesterdayGain = 0;
        let totalHistoricalGains = 0;
        let totalDaysTracked = 0;
        let firstTrackingDate = null;
        
        const tokenAPYData = {};
        
        wallets.forEach(wallet => {
            if (selectedWallets.includes(wallet.address)) {
                Object.keys(wallet.balances || {}).forEach(token => {
                    // Only count tokens with compose: true
                    if (!shouldCountToken(token)) {
                        return;
                    }
                    
                    const tokenBalances = wallet.balances[token];
                    
                    if (tokenBalances && tokenBalances.length > 0) {
                        const priceUSD = tokenPrices[token] || 1;
                        
                        // Get current balance
                        const latestEntry = tokenBalances[tokenBalances.length - 1];
                        const currentBalance = latestEntry.balance * priceUSD;
                        totalCurrentBalance += currentBalance;
                        
                        // Initialize token data if not exists
                        if (!tokenAPYData[token]) {
                            tokenAPYData[token] = {
                                currentBalance: 0,
                                todayGain: 0,
                                yesterdayGain: 0,
                                totalGains: 0,
                                daysTracked: 0,
                                firstDate: null
                            };
                        }
                        
                        tokenAPYData[token].currentBalance += currentBalance;
                        
                        // Calculate gains for each day and track historical data (skip excluded entries)
                        tokenBalances.forEach((entry, index) => {
                            if (entry.change !== undefined && entry.change !== 0 && !entry.excluded) {
                                const gainUSD = entry.change * priceUSD;
                                
                                // Track first date
                                if (!firstTrackingDate || !tokenAPYData[token].firstDate) {
                                    const entryDate = new Date(entry.date.split('/').reverse().join('-'));
                                    if (!firstTrackingDate || entryDate < firstTrackingDate) {
                                        firstTrackingDate = entryDate;
                                    }
                                    if (!tokenAPYData[token].firstDate || entryDate < new Date(tokenAPYData[token].firstDate)) {
                                        tokenAPYData[token].firstDate = entry.date;
                                    }
                                }
                                
                                // Today's gain
                                if (entry.date === today) {
                                    totalTodayGain += gainUSD;
                                    tokenAPYData[token].todayGain += gainUSD;
                                }
                                
                                // Yesterday's gain
                                if (entry.date === yesterday) {
                                    totalYesterdayGain += gainUSD;
                                    tokenAPYData[token].yesterdayGain += gainUSD;
                                }
                                
                                // Total historical gains
                                totalHistoricalGains += gainUSD;
                                tokenAPYData[token].totalGains += gainUSD;
                                tokenAPYData[token].daysTracked++;
                            }
                        });
                        
                        // Count total days tracked
                        if (tokenBalances.length > 1) {
                            totalDaysTracked = Math.max(totalDaysTracked, tokenBalances.length - 1);
                        }
                    }
                });
            }
        });
        
        // Calculate APYs
        const calculateAPY = (gain, balance, days = 1) => {
            if (balance <= 0 || days <= 0) return 0;
            const dailyReturn = gain / balance;
            return ((1 + dailyReturn) ** 365) - 1;
        };
        
        const todayAPY = calculateAPY(totalTodayGain, totalCurrentBalance, 1) * 100;
        const yesterdayAPY = calculateAPY(totalYesterdayGain, totalCurrentBalance, 1) * 100;
        
        // Annual APY based on historical data
        let annualAPY = 0;
        if (totalDaysTracked > 0 && totalCurrentBalance > 0) {
            const avgDailyGain = totalHistoricalGains / totalDaysTracked;
            annualAPY = calculateAPY(avgDailyGain, totalCurrentBalance, 1) * 100;
        }
        
        // Calculate token-specific APYs
        const tokenAPYs = {};
        Object.keys(tokenAPYData).forEach(token => {
            const data = tokenAPYData[token];
            tokenAPYs[token] = {
                currentBalance: data.currentBalance,
                todayAPY: calculateAPY(data.todayGain, data.currentBalance, 1) * 100,
                yesterdayAPY: calculateAPY(data.yesterdayGain, data.currentBalance, 1) * 100,
                annualAPY: data.daysTracked > 0 ? calculateAPY(data.totalGains / data.daysTracked, data.currentBalance, 1) * 100 : 0,
                daysTracked: data.daysTracked,
                firstDate: data.firstDate
            };
        });
        
        // Calculate days since first tracking
        const daysSinceStart = firstTrackingDate ? 
            Math.floor((new Date() - firstTrackingDate) / (1000 * 60 * 60 * 24)) : 0;
        
        res.json({
            totalCurrentBalanceUSD: totalCurrentBalance,
            totalTodayGainUSD: totalTodayGain,
            totalYesterdayGainUSD: totalYesterdayGain,
            totalHistoricalGainsUSD: totalHistoricalGains,
            apyData: {
                todayAPY: todayAPY,
                yesterdayAPY: yesterdayAPY,
                annualAPY: annualAPY,
                daysTracked: totalDaysTracked,
                daysSinceStart: daysSinceStart,
                firstTrackingDate: firstTrackingDate ? firstTrackingDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null
            },
            tokenAPYs: tokenAPYs,
            ethPrice: ethPrice
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Recalculate all changes for a wallet (useful after multiple exclusions)
app.post('/api/recalculate-wallet/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        const wallets = await database.collection('wallets').find({}).toArray();
        const wallet = wallets.find(w => w.address === address);
        
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        
        if (!wallet.balances) {
            return res.status(404).json({ error: 'No balances found for this wallet' });
        }
        
        let tokensRecalculated = 0;
        
        // Recalculate changes for each token
        Object.keys(wallet.balances).forEach(token => {
            const tokenBalances = wallet.balances[token];
            if (tokenBalances && tokenBalances.length > 0) {
                recalculateTokenChanges(tokenBalances);
                tokensRecalculated++;
            }
        });
        
        // Save the updated wallet
        await database.collection('wallets').updateOne(
            { id: address }, 
            { $set: { balances: wallet.balances } }
        );
        
        res.json({
            success: true,
            message: `Recalculated changes for ${tokensRecalculated} tokens`,
            tokensRecalculated
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Preload historical data for a wallet (10 days)
app.post('/api/preload-historical/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const { days = 10 } = req.body;
        
        const projects = await database.collection('projects').find({}).toArray();
        
        const settings = {
            app: undefined,
            environement: environement,
            database: database,
            account: undefined,
            verbose: true
        };
        
        // Initialize the program
        const program = require('./programs/aave-wallet-compose-calculation').init(settings);
        
        // Get current block number
        const currentBlock = await program.providerETH.getBlockNumber();
        
        // Calculate more accurate blocks per day (Ethereum averages ~12.5 seconds per block)
        const blocksPerDay = Math.floor(24 * 60 * 60 / 12.5);
        
        // Limit historical depth to avoid too old blocks that might cause issues
        const maxDaysBack = Math.min(days, 365); // Maximum 365 days back (1 year)
        
        const historicalData = [];
        
        // Get historical data for the specified number of days
        for (let dayOffset = 1; dayOffset <= maxDaysBack; dayOffset++) {
            try {
                const targetBlock = currentBlock - (blocksPerDay * dayOffset);
                
                // Skip if block is too old (before a reasonable cutoff)
                if (targetBlock < (currentBlock - (blocksPerDay * 400))) { // Skip blocks older than 400 days
                    console.log(`Skipping block ${targetBlock} (too old)`);
                    continue;
                }
                
                const targetDate = new Date(Date.now() - (dayOffset * 24 * 60 * 60 * 1000));
                const dateString = targetDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                console.log(`Fetching data for ${dateString} at block ${targetBlock}...`);
                
                const dayData = {
                    date: dateString,
                    block: targetBlock,
                    balances: {}
                };
                
                // Get balances for each project
                for (const project of projects) {
                    let totalBalance = 0;
                    
                    // Check regular contracts
                    const chainKeys = Object.keys(project.contracts || {});
                    for (const key of chainKeys) {
                        if (!['ETH', 'BSC'].includes(key)) continue;
                        
                        const currentContract = project.contracts[key];
                        if (currentContract.token && currentContract.token !== "0x0000000000000000000000000000000000000000") {
                            try {
                                const balance = await program.getTokenBalanceOfAtBlock(
                                    currentContract.token, 
                                    address, 
                                    key, 
                                    targetBlock
                                );
                                if (balance && balance !== '0') {
                                    totalBalance += Number(ethers.utils.formatUnits(balance, project.decimal || 18));
                                }
                            } catch (error) {
                                // Silently skip contracts that don't exist at this block
                                if (!error.message.includes('call revert exception')) {
                                    console.log(`Error getting balance for ${project.symbol} at block ${targetBlock}:`, error.message);
                                }
                            }
                        }
                    }
                    
                    if (totalBalance > 0) {
                        dayData.balances[project.symbol] = totalBalance;
                    }
                }
                
                historicalData.push(dayData);
                
                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`Error processing day ${dayOffset}:`, error);
            }
        }
        
        // Now update the wallet data with historical information
        let wallet = (await database.collection('wallets').find({ id: address }).toArray())[0];
        if (!wallet) {
            wallet = {
                id: address,
                address: address,
                balances: {}
            };
        }
        
        // Process historical data and calculate changes
        historicalData.reverse(); // Sort from oldest to newest
        
        for (let i = 0; i < historicalData.length; i++) {
            const currentDay = historicalData[i];
            const previousDay = i > 0 ? historicalData[i - 1] : null;
            
            Object.keys(currentDay.balances).forEach(token => {
                if (!wallet.balances[token]) {
                    wallet.balances[token] = [];
                }
                
                const currentBalance = currentDay.balances[token];
                const previousBalance = previousDay ? (previousDay.balances[token] || 0) : 0;
                
                const change = currentBalance - previousBalance;
                const percentageChange = previousBalance > 0 ? ((change / previousBalance) * 100) : 0;
                
                // Check if this date already exists
                const existingEntryIndex = wallet.balances[token].findIndex(entry => entry.date === currentDay.date);
                
                const entryData = {
                    date: currentDay.date,
                    balance: currentBalance,
                    change: change,
                    percentageChange: percentageChange,
                    block: currentDay.block
                };
                
                if (existingEntryIndex >= 0) {
                    // Update existing entry
                    wallet.balances[token][existingEntryIndex] = entryData;
                } else {
                    // Add new entry
                    wallet.balances[token].push(entryData);
                }
            });
        }
        
        // Sort all token balances by date
        Object.keys(wallet.balances).forEach(token => {
            wallet.balances[token].sort((a, b) => {
                const dateA = new Date(a.date.split('/').reverse().join('-'));
                const dateB = new Date(b.date.split('/').reverse().join('-'));
                return dateA - dateB;
            });
        });
        
        // Save updated wallet
        await database.collection('wallets').updateOne({ id: address }, { $set: wallet });
        
        res.json({
            success: true,
            message: `Historical data loaded for ${days} days`,
            daysProcessed: historicalData.length,
            wallet: wallet
        });
        
    } catch (error) {
        console.error('Error preloading historical data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Exclude/Include a specific day for a token in a wallet
app.post('/api/exclude-day/:address/:token', async (req, res) => {
    try {
        const { address, token } = req.params;
        const { date, exclude = true } = req.body;
        
        const wallets = await database.collection('wallets').find({}).toArray();
        const wallet = wallets.find(w => w.address === address);
        
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        
        if (!wallet.balances || !wallet.balances[token]) {
            return res.status(404).json({ 
                error: 'Token not found in wallet',
                availableTokens: wallet.balances ? Object.keys(wallet.balances) : [],
                requestedToken: token
            });
        }
        
        // Find the entry for the specific date
        const tokenBalances = wallet.balances[token];
        const entryIndex = tokenBalances.findIndex(entry => entry.date === date);
        
        if (entryIndex === -1) {
            return res.status(404).json({ 
                error: 'Date not found for this token',
                availableDates: tokenBalances.map(entry => entry.date),
                requestedDate: date
            });
        }
        
        // Update the excluded status
        tokenBalances[entryIndex].excluded = exclude;
        
        // Recalculate changes for all entries after exclusion/inclusion
        recalculateTokenChanges(tokenBalances);
        
        // Save the updated wallet
        await database.collection('wallets').updateOne(
            { id: address }, 
            { $set: { balances: wallet.balances } }
        );
        
        res.json({
            success: true,
            message: `Day ${date} for ${token} ${exclude ? 'excluded' : 'included'} and changes recalculated`,
            entry: tokenBalances[entryIndex]
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger tracking for a specific wallet
app.post('/api/track-wallet/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const projects = await database.collection('projects').find({}).toArray();
        
        const settings = {
            app: undefined,
            environement: environement,
            database: database,
            account: undefined,
            verbose: true
        };
        
        const wallet = { id: address, address: address };
        await require('./programs/aave-wallet-compose-calculation').init(settings).runOneWallet(wallet, projects, true);
        
        res.json({ success: true, message: 'Wallet tracking completed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`AAVE Tracker server running on http://localhost:${PORT}`);

    const settings = {
        app: undefined,
        environement: environement,
        database: database,
        account: undefined,
        verbose: true
    };
    
    await require('./programs/aave-wallet-compose-calculation').init(settings).scheduleAllWallets();
}); 
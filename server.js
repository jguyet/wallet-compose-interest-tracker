const express = require('express');
const path = require('path');
const environementLoader = require('./environements/environement.js');

const environement = environementLoader.load();
const database = require('./database/file-storage-database').database(path.join(__dirname, './database'));

const app = express();
const PORT = process.env.PORT || 8083;

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
        
        const aggregatedBalances = {};
        
        wallets.forEach(wallet => {
            if (selectedWallets.includes(wallet.address)) {
                Object.keys(wallet.balances || {}).forEach(token => {
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
                    const date = entry.date;
                    if (!aggregatedHistory[date]) {
                        aggregatedHistory[date] = {
                            date: date,
                            balance: 0,
                            change: 0,
                            percentageChange: 0
                        };
                    }
                    
                    aggregatedHistory[date].balance += entry.balance || 0;
                    aggregatedHistory[date].change += entry.change || 0;
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
        
        // Get ETH price
        const ethPriceResponse = await fetch(`http://localhost:${PORT}/api/eth-price`);
        const ethPriceData = await ethPriceResponse.json();
        const ethPrice = ethPriceData.price;
        
        // Token prices in USD
        const tokenPrices = {
            'USDT': 1,
            'USDC': 1,
            'stETH': ethPrice,
            'ETH': ethPrice
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
                    const tokenBalances = wallet.balances[token];
                    
                    if (tokenBalances && tokenBalances.length >= 2) {
                        const priceUSD = tokenPrices[token] || 1;
                        
                        // Find today's entry
                        const todayEntry = tokenBalances.find(entry => entry.date === today);
                        if (todayEntry && todayEntry.change !== undefined) {
                            const changeUSD = todayEntry.change * priceUSD;
                            
                            if (!todayTokenGains[token]) {
                                todayTokenGains[token] = 0;
                            }
                            todayTokenGains[token] += changeUSD;
                            totalTodayGainUSD += changeUSD;
                        }
                        
                        // Find yesterday's entry
                        const yesterdayEntry = tokenBalances.find(entry => entry.date === yesterday);
                        if (yesterdayEntry && yesterdayEntry.change !== undefined) {
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
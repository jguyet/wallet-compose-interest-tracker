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
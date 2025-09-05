// Global state
let wallets = [];
let selectedWallets = [];
let currentToken = null;

// Utility functions
function showLoading(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
}

function showError(message, containerId = null) {
    const errorHtml = `<div class="error">❌ ${message}</div>`;
    
    if (containerId) {
        document.getElementById(containerId).innerHTML = errorHtml;
    } else {
        // Show in the first section
        const firstSection = document.querySelector('.section');
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = errorHtml;
        firstSection.insertBefore(errorDiv.firstChild, firstSection.firstChild);
        
        // Remove after 5 seconds
        setTimeout(() => {
            const errorEl = document.querySelector('.error');
            if (errorEl) errorEl.remove();
        }, 5000);
    }
}

function showSuccess(message) {
    const successHtml = `<div class="success">✅ ${message}</div>`;
    const firstSection = document.querySelector('.section');
    const successDiv = document.createElement('div');
    successDiv.innerHTML = successHtml;
    firstSection.insertBefore(successDiv.firstChild, firstSection.firstChild);
    
    // Remove after 3 seconds
    setTimeout(() => {
        const successEl = document.querySelector('.success');
        if (successEl) successEl.remove();
    }, 3000);
}

function formatNumber(num) {
    if (num === 0) return '0.00';
    if (num < 0.01) return num.toExponential(2);
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function formatPercentage(num) {
    if (num === 0) return '0.00%';
    return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
}

function shortenAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// API functions
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Wallet management functions
async function loadWallets() {
    try {
        showLoading('walletList');
        wallets = await apiCall('/api/wallets');
        
        // Initialize selected wallets if empty
        if (selectedWallets.length === 0) {
            selectedWallets = wallets.map(w => w.address);
        }
        
        renderWallets();
        await loadTokenOverview();
    } catch (error) {
        showError('Failed to load wallets', 'walletList');
    }
}

function renderWallets() {
    const walletList = document.getElementById('walletList');
    
    if (wallets.length === 0) {
        walletList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No wallets added yet. Add a wallet above to get started!</div>';
        return;
    }
    
    walletList.innerHTML = wallets.map(wallet => `
        <div class="wallet-item">
            <input type="checkbox" class="wallet-checkbox" 
                   ${selectedWallets.includes(wallet.address) ? 'checked' : ''}
                   onchange="toggleWallet('${wallet.address}')">
            <span class="wallet-address" title="${wallet.address}">
                ${shortenAddress(wallet.address)}
            </span>
            <div class="wallet-actions">
                <button onclick="trackWallet('${wallet.address}')" class="btn btn-secondary">
                    Update Data
                </button>
                <button onclick="removeWallet('${wallet.address}')" class="btn btn-danger">
                    Remove
                </button>
            </div>
        </div>
    `).join('');
}

async function addWallet() {
    const input = document.getElementById('walletInput');
    const address = input.value.trim();
    
    if (!address) {
        showError('Please enter a wallet address');
        return;
    }
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        showError('Please enter a valid Ethereum address');
        return;
    }
    
    if (wallets.find(w => w.address.toLowerCase() === address.toLowerCase())) {
        showError('This wallet is already being tracked');
        return;
    }
    
    try {
        await apiCall('/api/wallets', {
            method: 'POST',
            body: JSON.stringify({ address })
        });
        
        input.value = '';
        showSuccess('Wallet added successfully');
        await loadWallets();
    } catch (error) {
        showError('Failed to add wallet');
    }
}

async function removeWallet(address) {
    if (!confirm('Are you sure you want to remove this wallet?')) {
        return;
    }
    
    try {
        await apiCall(`/api/wallets/${address}`, {
            method: 'DELETE'
        });
        
        showSuccess('Wallet removed successfully');
        await loadWallets();
    } catch (error) {
        showError('Failed to remove wallet');
    }
}

async function trackWallet(address) {
    try {
        showSuccess('Updating wallet data...');
        await apiCall(`/api/track-wallet/${address}`, {
            method: 'POST'
        });
        
        showSuccess('Wallet data updated successfully');
        await loadWallets();
    } catch (error) {
        showError('Failed to update wallet data');
    }
}

function toggleWallet(address) {
    if (selectedWallets.includes(address)) {
        selectedWallets = selectedWallets.filter(a => a !== address);
    } else {
        selectedWallets.push(address);
    }
    
    loadTokenOverview();
}

function selectAllWallets() {
    selectedWallets = wallets.map(w => w.address);
    renderWallets();
    loadTokenOverview();
}

function deselectAllWallets() {
    selectedWallets = [];
    renderWallets();
    loadTokenOverview();
}

// Token overview functions
async function loadTokenOverview() {
    if (selectedWallets.length === 0) {
        document.getElementById('tokenOverview').innerHTML = 
            '<div style="text-align: center; color: #666; padding: 40px;">Select wallets to see token overview</div>';
        return;
    }
    
    try {
        showLoading('tokenOverview');
        const balances = await apiCall('/api/aggregated-balances', {
            method: 'POST',
            body: JSON.stringify({ selectedWallets })
        });
        
        renderTokenOverview(balances);
    } catch (error) {
        showError('Failed to load token overview', 'tokenOverview');
    }
}

function renderTokenOverview(balances) {
    const tokenOverview = document.getElementById('tokenOverview');
    
    const tokens = Object.keys(balances);
    
    if (tokens.length === 0) {
        tokenOverview.innerHTML = 
            '<div style="text-align: center; color: #666; padding: 40px;">No token data available for selected wallets</div>';
        return;
    }
    
    tokenOverview.innerHTML = tokens.map(token => `
        <div class="token-card ${currentToken === token ? 'selected' : ''}" 
             onclick="selectToken('${token}')">
            <div class="token-name">${token}</div>
            <div class="token-balance">${formatNumber(balances[token])}</div>
        </div>
    `).join('');
}

// Token details functions
async function selectToken(token) {
    currentToken = token;
    
    // Update visual selection
    document.querySelectorAll('.token-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.target.closest('.token-card').classList.add('selected');
    
    // Show token details section
    document.getElementById('tokenDetails').classList.remove('hidden');
    document.getElementById('tokenDetailsTitle').textContent = `📊 ${token} Details`;
    
    await loadTokenHistory(token);
}

async function loadTokenHistory(token) {
    if (selectedWallets.length === 0) {
        document.getElementById('tokenHistory').innerHTML = 
            '<div style="text-align: center; color: #666; padding: 20px;">No wallets selected</div>';
        return;
    }
    
    try {
        showLoading('tokenHistory');
        const history = await apiCall(`/api/token-history/${token}`, {
            method: 'POST',
            body: JSON.stringify({ selectedWallets })
        });
        
        renderTokenHistory(history);
    } catch (error) {
        showError('Failed to load token history', 'tokenHistory');
    }
}

function renderTokenHistory(history) {
    const tokenHistory = document.getElementById('tokenHistory');
    
    if (history.length === 0) {
        tokenHistory.innerHTML = 
            '<div style="text-align: center; color: #666; padding: 20px;">No history data available</div>';
        return;
    }
    
    const tableHTML = `
        <table class="history-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Balance</th>
                    <th>Change</th>
                    <th>Change %</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(entry => `
                    <tr>
                        <td>${entry.date}</td>
                        <td>${formatNumber(entry.balance)}</td>
                        <td class="${entry.change >= 0 ? 'positive' : 'negative'}">
                            ${entry.change >= 0 ? '+' : ''}${formatNumber(entry.change)}
                        </td>
                        <td class="${entry.percentageChange >= 0 ? 'positive' : 'negative'}">
                            ${formatPercentage(entry.percentageChange)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    tokenHistory.innerHTML = tableHTML;
}

// Refresh data
async function refreshData() {
    showSuccess('Refreshing all data...');
    await loadWallets();
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'walletInput') {
        addWallet();
    }
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadWallets();
}); 
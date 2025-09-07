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

function formatCurrency(num) {
    if (num === 0) return '$0.00';
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(num));
    return (num >= 0 ? '+' : '-') + formatted;
}

function formatAPY(apy) {
    if (apy === 0 || !isFinite(apy)) return '0.00%';
    return (apy > 0 ? '+' : '') + apy.toFixed(2) + '%';
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
        await loadDailyGains();
        await loadAPYAnalysis();
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
                <button onclick="preloadHistoricalData('${wallet.address}', 7)" class="btn btn-primary" style="font-size: 0.8em;">
                    Load 7 Days
                </button>
                <button onclick="preloadHistoricalData('${wallet.address}', 365)" class="btn btn-primary" style="font-size: 0.8em; background: linear-gradient(135deg, #e67e22 0%, #d35400 100%);">
                    Load 1 Year
                </button>
                <button onclick="recalculateWallet('${wallet.address}')" class="btn btn-secondary" style="font-size: 0.8em;">
                    Recalc
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

async function preloadHistoricalData(address, days = 7) {
    const timeEstimate = days <= 7 ? 'a few minutes' : days <= 30 ? '5-10 minutes' : 'up to 30 minutes';
    if (!confirm(`This will load ${days} days of historical data. This may take ${timeEstimate}. Continue?`)) {
        return;
    }
    
    try {
        showSuccess(`Loading ${days} days of historical data... This may take a few minutes.`);
        
        // Show loading indicator
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = 'Loading...';
        button.disabled = true;
        
        const result = await apiCall(`/api/preload-historical/${address}`, {
            method: 'POST',
            body: JSON.stringify({ days: days })
        });
        
        showSuccess(`Historical data loaded successfully! Processed ${result.daysProcessed} days.`);
        await loadWallets();
        
        // Restore button
        button.textContent = originalText;
        button.disabled = false;
        
    } catch (error) {
        showError('Failed to load historical data: ' + error.message);
        
        // Restore button on error
        const button = event.target;
        button.textContent = originalText;
        button.disabled = false;
    }
}

async function recalculateWallet(address) {
    try {
        showSuccess('Recalculating wallet changes...');
        
        const result = await apiCall(`/api/recalculate-wallet/${address}`, {
            method: 'POST'
        });
        
        showSuccess(`Recalculated changes for ${result.tokensRecalculated} tokens`);
        
        // Reload all views to reflect changes
        await loadWallets();
        
    } catch (error) {
        showError('Failed to recalculate wallet: ' + error.message);
    }
}

function toggleWallet(address) {
    if (selectedWallets.includes(address)) {
        selectedWallets = selectedWallets.filter(a => a !== address);
    } else {
        selectedWallets.push(address);
    }
    
    loadTokenOverview();
    loadDailyGains();
    loadAPYAnalysis();
}

function selectAllWallets() {
    selectedWallets = wallets.map(w => w.address);
    renderWallets();
    loadTokenOverview();
    loadDailyGains();
    loadAPYAnalysis();
}

function deselectAllWallets() {
    selectedWallets = [];
    renderWallets();
    loadTokenOverview();
    loadDailyGains();
    loadAPYAnalysis();
}

// Daily gains functions
async function loadDailyGains() {
    if (selectedWallets.length === 0) {
        document.getElementById('dailyGains').innerHTML = 
            '<div style="text-align: center; color: #666; padding: 40px;">Select wallets to see daily gains</div>';
        return;
    }
    
    try {
        showLoading('dailyGains');
        const gains = await apiCall('/api/daily-gains', {
            method: 'POST',
            body: JSON.stringify({ selectedWallets })
        });
        
        renderDailyGains(gains);
    } catch (error) {
        showError('Failed to load daily gains', 'dailyGains');
    }
}

function renderDailyGains(gains) {
    const dailyGains = document.getElementById('dailyGains');
    
    // Today's gains card
    const isTodayPositive = gains.today.totalGainUSD >= 0;
    const todayGainsCard = `
        <div class="total-gains-card ${isTodayPositive ? '' : 'negative'}">
            <div class="total-gains-title">Today's Gains</div>
            <div class="total-gains-amount">${formatCurrency(gains.today.totalGainUSD)}</div>
            <div class="total-gains-date">${gains.today.date}</div>
        </div>
    `;
    
    // Yesterday's gains card
    const isYesterdayPositive = gains.yesterday.totalGainUSD >= 0;
    const yesterdayGainsCard = `
        <div class="total-gains-card ${isYesterdayPositive ? '' : 'negative'}">
            <div class="total-gains-title">Yesterday's Gains</div>
            <div class="total-gains-amount">${formatCurrency(gains.yesterday.totalGainUSD)}</div>
            <div class="total-gains-date">${gains.yesterday.date}</div>
        </div>
    `;
    
    // Combined token gains breakdown
    const allTokens = new Set([
        ...Object.keys(gains.today.tokenGains),
        ...Object.keys(gains.yesterday.tokenGains)
    ]);
    
    const tokenGainsList = allTokens.size > 0 
        ? Array.from(allTokens).map(token => {
            const todayAmount = gains.today.tokenGains[token] || 0;
            const yesterdayAmount = gains.yesterday.tokenGains[token] || 0;
            
            return `
                <div class="token-gain-item">
                    <span class="token-gain-name">${token}</span>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                        <span class="token-gain-amount ${todayAmount >= 0 ? 'positive' : 'negative'}" style="font-size: 0.9em;">
                            Today: ${formatCurrency(todayAmount)}
                        </span>
                        <span class="token-gain-amount ${yesterdayAmount >= 0 ? 'positive' : 'negative'}" style="font-size: 0.85em; opacity: 0.7;">
                            Yesterday: ${formatCurrency(yesterdayAmount)}
                        </span>
                    </div>
                </div>
            `;
        }).join('')
        : '<div style="text-align: center; color: #666; padding: 20px;">No gains data available</div>';
    
    const tokenGainsBreakdown = `
        <div class="token-gains-breakdown">
            <div class="token-gains-title">Breakdown by Token</div>
            ${tokenGainsList}
            <div class="eth-price">
                ETH Price: $${formatNumber(gains.ethPrice)}
            </div>
        </div>
    `;
    
    dailyGains.innerHTML = todayGainsCard + yesterdayGainsCard + tokenGainsBreakdown;
}

// APY Analysis functions
async function loadAPYAnalysis() {
    if (selectedWallets.length === 0) {
        document.getElementById('apyAnalysis').innerHTML = 
            '<div style="text-align: center; color: #666; padding: 40px;">Select wallets to see APY analysis</div>';
        return;
    }
    
    try {
        showLoading('apyAnalysis');
        const apyData = await apiCall('/api/apy-calculations', {
            method: 'POST',
            body: JSON.stringify({ selectedWallets })
        });
        
        renderAPYAnalysis(apyData);
    } catch (error) {
        showError('Failed to load APY analysis', 'apyAnalysis');
    }
}

function renderAPYAnalysis(data) {
    const apyAnalysis = document.getElementById('apyAnalysis');
    
    // Today's APY card
    const isTodayPositive = data.apyData.todayAPY >= 0;
    const todayAPYCard = `
        <div class="apy-card ${isTodayPositive ? '' : 'negative'}">
            <div class="apy-title">Today's APY</div>
            <div class="apy-value">${formatAPY(data.apyData.todayAPY)}</div>
            <div class="apy-subtitle">Daily Rate</div>
        </div>
    `;
    
    // Yesterday's APY card
    const isYesterdayPositive = data.apyData.yesterdayAPY >= 0;
    const yesterdayAPYCard = `
        <div class="apy-card ${isYesterdayPositive ? '' : 'negative'}">
            <div class="apy-title">Yesterday's APY</div>
            <div class="apy-value">${formatAPY(data.apyData.yesterdayAPY)}</div>
            <div class="apy-subtitle">Daily Rate</div>
        </div>
    `;
    
    // Annual APY card
    const isAnnualPositive = data.apyData.annualAPY >= 0;
    const annualAPYCard = `
        <div class="apy-card annual ${isAnnualPositive ? '' : 'negative'}">
            <div class="apy-title">Estimated Annual APY</div>
            <div class="apy-value">${formatAPY(data.apyData.annualAPY)}</div>
            <div class="apy-subtitle">Based on ${data.apyData.daysTracked} days</div>
        </div>
    `;
    
    // Token APY breakdown
    const tokenAPYs = data.tokenAPYs;
    const tokenAPYList = Object.keys(tokenAPYs).length > 0 
        ? Object.entries(tokenAPYs).map(([token, apyData]) => `
            <div class="token-apy-item">
                <div>
                    <span class="token-apy-name">${token}</span>
                    <div style="font-size: 0.8em; color: #666; margin-top: 2px;">
                        ${formatCurrency(apyData.currentBalance)}
                    </div>
                </div>
                <div class="token-apy-values">
                    <span class="token-apy-value today">
                        Today: ${formatAPY(apyData.todayAPY)}
                    </span>
                    <span class="token-apy-value yesterday">
                        Yesterday: ${formatAPY(apyData.yesterdayAPY)}
                    </span>
                    <span class="token-apy-value annual">
                        Annual: ${formatAPY(apyData.annualAPY)}
                    </span>
                </div>
            </div>
        `).join('')
        : '<div style="text-align: center; color: #666; padding: 20px;">No APY data available</div>';
    
    const tokenAPYBreakdown = `
        <div class="token-apy-breakdown">
            <div class="token-apy-title">APY Breakdown by Token</div>
            ${tokenAPYList}
            <div class="apy-stats">
                <div><strong>Total Portfolio:</strong> ${formatCurrency(data.totalCurrentBalanceUSD)}</div>
                <div><strong>Historical Gains:</strong> ${formatCurrency(data.totalHistoricalGainsUSD)}</div>
                <div><strong>Tracking Since:</strong> ${data.apyData.firstTrackingDate || 'N/A'} (${data.apyData.daysSinceStart} days)</div>
                <div><strong>ETH Price:</strong> $${formatNumber(data.ethPrice)}</div>
            </div>
        </div>
    `;
    
    apyAnalysis.innerHTML = todayAPYCard + yesterdayAPYCard + annualAPYCard + tokenAPYBreakdown;
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
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(entry => {
                    const isExcluded = entry.walletEntries && entry.walletEntries.some(we => we.entry.excluded);
                    return `
                        <tr class="${isExcluded ? 'excluded' : ''}">
                            <td>${entry.date}</td>
                            <td>${formatNumber(entry.balance)}</td>
                            <td class="${entry.change >= 0 ? 'positive' : 'negative'}">
                                ${entry.change >= 0 ? '+' : ''}${formatNumber(entry.change)}
                            </td>
                            <td class="${entry.percentageChange >= 0 ? 'positive' : 'negative'}">
                                ${formatPercentage(entry.percentageChange)}
                            </td>
                            <td>
                                ${isExcluded ? 
                                    `<button class="exclude-btn include" onclick="toggleDayExclusion('${entry.date}', false)">Include</button>` :
                                    `<button class="exclude-btn exclude" onclick="toggleDayExclusion('${entry.date}', true)">Exclude</button>`
                                }
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    
    tokenHistory.innerHTML = tableHTML;
}

// Toggle day exclusion for current token
async function toggleDayExclusion(date, exclude) {
    if (!currentToken) {
        showError('No token selected');
        return;
    }
    
    try {
        // For each selected wallet, toggle the exclusion for this date and token
        const promises = selectedWallets.map(async (walletAddress) => {
            try {
                await apiCall(`/api/exclude-day/${walletAddress}/${currentToken}`, {
                    method: 'POST',
                    body: JSON.stringify({ date, exclude })
                });
            } catch (error) {
                // Ignore 404 errors (wallet doesn't have this token/date)
                if (!error.message.includes('404')) {
                    throw error;
                }
            }
        });
        
        await Promise.all(promises);
        
        showSuccess(`Day ${date} ${exclude ? 'excluded' : 'included'} for ${currentToken}`);
        
        // Reload the token history to reflect changes
        await loadTokenHistory(currentToken);
        
        // Also reload other views to update calculations
        await loadDailyGains();
        await loadAPYAnalysis();
        
    } catch (error) {
        showError(`Failed to ${exclude ? 'exclude' : 'include'} day: ` + error.message);
    }
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
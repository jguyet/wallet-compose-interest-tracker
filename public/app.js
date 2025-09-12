// Global state
let wallets = [];
let selectedWallets = [];
let currentToken = null;
let compoundChart = null;

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
    
    // Handle very small percentages that might show in scientific notation
    if (Math.abs(num) < 0.01 && num !== 0) {
        const formatted = num.toFixed(6).replace(/\.?0+$/, '');
        return (num > 0 ? '+' : '') + formatted + '%';
    }
    
    return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
}

function formatCurrency(num) {
    if (num === 0) return '$0.00';
    
    // Handle very small amounts that would show in scientific notation
    if (Math.abs(num) < 0.01 && num !== 0) {
        const absNum = Math.abs(num);
        let decimals = 6;
        if (absNum < 0.000001) decimals = 8;
        const formatted = absNum.toFixed(decimals).replace(/\.?0+$/, '');
        return (num >= 0 ? '+' : '-') + '$' + formatted;
    }
    
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(num));
    return (num >= 0 ? '+' : '-') + formatted;
}

function formatAPY(apy) {
    if (apy === 0 || !isFinite(apy) || apy === null) return '0.00%';
    
    // Handle very small APY values that might show in scientific notation
    if (Math.abs(apy) < 0.01 && apy !== 0) {
        const formatted = apy.toFixed(6).replace(/\.?0+$/, '');
        return (apy > 0 ? '+' : '') + formatted + '%';
    }
    
    return (apy > 0 ? '+' : '') + apy.toFixed(2) + '%';
}

function formatNumber(value) {
    if (value == null || isNaN(value)) return '0';
    
    // Handle very small numbers that would show in scientific notation
    if (Math.abs(value) < 0.000001 && value !== 0) {
        return value.toFixed(8).replace(/\.?0+$/, '');
    }
    
    // Handle small decimals
    if (Math.abs(value) < 0.01 && value !== 0) {
        return value.toFixed(6).replace(/\.?0+$/, '');
    }
    
    // Handle normal numbers
    if (Math.abs(value) < 1) {
        return value.toFixed(4).replace(/\.?0+$/, '');
    }
    
    // Handle larger numbers with appropriate decimal places
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
    }).format(value);
}

function formatBalance(balance, symbol = '') {
    if (balance == null || isNaN(balance)) return '0';
    
    const formattedNumber = formatNumber(balance);
    return symbol ? `${formattedNumber} ${symbol}` : formattedNumber;
}

function formatTokenAmount(amount, symbol = '') {
    if (amount == null || isNaN(amount)) return '0';
    
    // Special handling for ETH and stETH to show more precision
    if (symbol === 'ETH' || symbol === 'stETH') {
        if (Math.abs(amount) < 0.000001 && amount !== 0) {
            const formatted = amount.toFixed(12).replace(/\.?0+$/, '');
            return symbol ? `${formatted} ${symbol}` : formatted;
        }
        if (Math.abs(amount) < 0.01 && amount !== 0) {
            const formatted = amount.toFixed(8).replace(/\.?0+$/, '');
            return symbol ? `${formatted} ${symbol}` : formatted;
        }
        if (Math.abs(amount) < 1) {
            const formatted = amount.toFixed(6).replace(/\.?0+$/, '');
            return symbol ? `${formatted} ${symbol}` : formatted;
        }
        const formatted = amount.toFixed(4).replace(/\.?0+$/, '');
        return symbol ? `${formatted} ${symbol}` : formatted;
    }
    
    // For other tokens, use the standard formatNumber
    const formattedNumber = formatNumber(amount);
    return symbol ? `${formattedNumber} ${symbol}` : formattedNumber;
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
        await loadDailyGainsTable();
        await loadAPYAnalysis();
        await loadCompoundProjection();
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
    loadDailyGainsTable();
    loadAPYAnalysis();
    loadCompoundProjection();
}

function selectAllWallets() {
    selectedWallets = wallets.map(w => w.address);
    renderWallets();
    loadTokenOverview();
    loadDailyGains();
    loadDailyGainsTable();
    loadAPYAnalysis();
    loadCompoundProjection();
}

function deselectAllWallets() {
    selectedWallets = [];
    renderWallets();
    loadTokenOverview();
    loadDailyGains();
    loadDailyGainsTable();
    loadAPYAnalysis();
    loadCompoundProjection();
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
        console.log(error);
        showError('Failed to load APY analysis', 'apyAnalysis');
    }
}

function renderAPYAnalysis(data) {
    const apyAnalysis = document.getElementById('apyAnalysis');
    
    // Yesterday's APY card
    const isYesterdayPositive = data.apyData.yesterdayAPY >= 0;
    const yesterdayAPYCard = `
        <div class="apy-card ${isYesterdayPositive ? '' : 'negative'}">
            <div class="apy-title">Yesterday's APY</div>
            <div class="apy-value">${formatAPY(data.apyData.yesterdayAPY)}</div>
            <div class="apy-subtitle">Daily Rate</div>
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
                    <span class="token-apy-value yesterday">
                        Yesterday: ${formatAPY(apyData.yesterdayAPY)}
                    </span>
                    <span class="token-apy-value annual">
                        Historical: ${formatAPY(apyData.annualAPY)}
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
    
    apyAnalysis.innerHTML = yesterdayAPYCard + tokenAPYBreakdown;
}

// Compound Interest Projection functions
async function loadCompoundProjection() {
    if (selectedWallets.length === 0) {
        document.getElementById('projectionStats').innerHTML = 
            '<div style="text-align: center; color: #666; padding: 40px;">Select wallets to see compound interest projection</div>';
        
        // Clear chart
        if (compoundChart) {
            compoundChart.destroy();
            compoundChart = null;
        }
        return;
    }
    
    try {
        showLoading('projectionStats');
        
        // Get control values
        const annualCashout = parseFloat(document.getElementById('annualCashout').value) || 0;
        
        const projectionData = await apiCall('/api/compound-projections', {
            method: 'POST',
            body: JSON.stringify({ 
                selectedWallets,
                annualCashout
            })
        });
        
        renderCompoundProjection(projectionData);
    } catch (error) {
        showError('Failed to load compound projection', 'projectionStats');
    }
}

function renderCompoundProjection(data) {
    const projectionStats = document.getElementById('projectionStats');
    
    // Render stats
    const oneYearProjection = data.projections.find(p => p.year === 1);
    const fiveYearProjection = data.projections.find(p => p.year === 5);
    const tenYearProjection = data.projections.find(p => p.year === 10);
    const twentyYearProjection = data.projections.find(p => p.year === 20);
    
    const statsHTML = `
        <div class="projection-stat">
            <span class="projection-stat-label">Current Balance</span>
            <span class="projection-stat-value">${formatCurrency(data.currentBalance)}</span>
        </div>
        <div class="projection-stat" style="border-left-color: #e74c3c;">
            <span class="projection-stat-label">Projection APY</span>
            <span class="projection-stat-value" style="color: #e74c3c;">${formatAPY(data.yesterdayAPY)} (Yesterday's)</span>
        </div>
        <div class="projection-stat">
            <span class="projection-stat-label">Historical APY</span>
            <span class="projection-stat-value">${formatAPY(data.annualAPY)} (Annual)</span>
        </div>
        <div class="projection-stat">
            <span class="projection-stat-label">Data Points</span>
            <span class="projection-stat-value">${data.daysTracked} days</span>
        </div>
        ${data.annualCashout > 0 ? `
        <div class="projection-stat">
            <span class="projection-stat-label">Annual Cashout</span>
            <span class="projection-stat-value">${formatCurrency(data.annualCashout)}</span>
        </div>
        ` : ''}
        <div class="projection-stat">
            <span class="projection-stat-label">In 1 Year</span>
            <span class="projection-stat-value">${formatCurrency(oneYearProjection?.balance || 0)}</span>
        </div>
        <div class="projection-stat">
            <span class="projection-stat-label">In 5 Years</span>
            <span class="projection-stat-value">${formatCurrency(fiveYearProjection?.balance || 0)}</span>
        </div>
        <div class="projection-stat">
            <span class="projection-stat-label">In 10 Years</span>
            <span class="projection-stat-value">${formatCurrency(tenYearProjection?.balance || 0)}</span>
        </div>
        <div class="projection-stat">
            <span class="projection-stat-label">In 20 Years</span>
            <span class="projection-stat-value">${formatCurrency(twentyYearProjection?.balance || 0)}</span>
        </div>
        <div class="projection-stat" style="border-left-color: #e74c3c;">
            <span class="projection-stat-label">Inflation Target (20Y)</span>
            <span class="projection-stat-value" style="color: #e74c3c;">${formatCurrency(twentyYearProjection?.inflationBaseline || 0)}</span>
        </div>
        ${twentyYearProjection ? `
        <div class="projection-stat" style="border-left-color: ${twentyYearProjection.balance > twentyYearProjection.inflationBaseline ? '#27ae60' : '#e74c3c'};">
            <span class="projection-stat-label">vs Inflation</span>
            <span class="projection-stat-value" style="color: ${twentyYearProjection.balance > twentyYearProjection.inflationBaseline ? '#27ae60' : '#e74c3c'};">
                ${twentyYearProjection.balance > twentyYearProjection.inflationBaseline ? '✅ Beats' : '❌ Below'} 
                (${formatCurrency(Math.abs(twentyYearProjection.balance - twentyYearProjection.inflationBaseline))})
            </span>
        </div>
        ` : ''}
        ${twentyYearProjection?.annualGains > 0 ? `
        <div class="projection-stat" style="border-left-color: #27ae60;">
            <span class="projection-stat-label">Year 20 Gains</span>
            <span class="projection-stat-value" style="color: #27ae60;">${formatCurrency(twentyYearProjection.annualGains)}</span>
        </div>
        ` : ''}
        ${data.annualCashout > 0 && twentyYearProjection?.totalCashout > 0 ? `
        <div class="projection-stat" style="border-left-color: #f39c12;">
            <span class="projection-stat-label">20Y Total Cashout</span>
            <span class="projection-stat-value" style="color: #f39c12;">${formatCurrency(twentyYearProjection.totalCashout)}</span>
        </div>
        ` : ''}
    `;
    
    projectionStats.innerHTML = statsHTML;
    
    // Render chart
    renderCompoundChart(data);
}

function renderCompoundChart(data) {
    const ctx = document.getElementById('compoundChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (compoundChart) {
        compoundChart.destroy();
    }
    
    // Prepare data for Chart.js
    const labels = data.projections.map(p => `Year ${p.year}`);
    const balanceData = data.projections.map(p => p.balance);
    const inflationData = data.projections.map(p => p.inflationBaseline);
    const currentIndex = 0; // Year 0 is always the first point
    
    // Create gradient for the line
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.8)');
    gradient.addColorStop(1, 'rgba(102, 126, 234, 0.1)');
    
    compoundChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Portfolio Value',
                data: balanceData,
                borderColor: '#667eea',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: false,
                tension: 0.4,
                pointBackgroundColor: balanceData.map((_, index) => 
                    index === currentIndex ? '#e74c3c' : '#667eea'
                ),
                pointBorderColor: balanceData.map((_, index) => 
                    index === currentIndex ? '#c0392b' : '#4c6ef5'
                ),
                pointRadius: balanceData.map((_, index) => 
                    index === currentIndex ? 8 : 4
                ),
                pointHoverRadius: balanceData.map((_, index) => 
                    index === currentIndex ? 10 : 6
                )
            }, {
                label: 'Inflation Baseline (2%)',
                data: inflationData,
                borderColor: '#e74c3c',
                backgroundColor: 'transparent',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                borderDash: [5, 5], // Dashed line
                pointBackgroundColor: '#e74c3c',
                pointBorderColor: '#c0392b',
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Portfolio Projection (20 Years)',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const projection = data.projections[context.dataIndex];
                            
                            if (context.datasetIndex === 0) {
                                // Portfolio Value dataset
                                const balance = formatCurrency(projection.balance);
                                const annualGains = formatCurrency(projection.annualGains);
                                const inflationBaseline = formatCurrency(projection.inflationBaseline);
                                const beatsInflation = projection.balance > projection.inflationBaseline;
                                
                                const tooltipLines = [
                                    `Portfolio: ${balance}`,
                                    `Annual Gains: ${annualGains}`,
                                    `Inflation Target: ${inflationBaseline}`,
                                    `Status: ${beatsInflation ? '✅ Beats Inflation' : '❌ Below Inflation'}`,
                                    `Year: ${projection.year}`
                                ];
                                
                                // Add cashout info if applicable
                                if (projection.totalCashout > 0) {
                                    tooltipLines.push(`Total Cashout: ${formatCurrency(projection.totalCashout)}`);
                                }
                                
                                return tooltipLines;
                            } else {
                                // Inflation baseline dataset
                                const inflationBaseline = formatCurrency(projection.inflationBaseline);
                                return [
                                    `Inflation Target: ${inflationBaseline}`,
                                    `Year: ${projection.year}`,
                                    `(2% annual growth)`
                                ];
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Years'
                    },
                    ticks: {
                        maxTicksLimit: 11, // Show every 2 years approximately (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20)
                        callback: function(value, index) {
                            // Show Year 0, every 2 years, and Year 20
                            if (index === 0 || index === 20 || index % 2 === 0) {
                                return this.getLabelForValue(value);
                            }
                            return '';
                        }
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Portfolio Value (USD)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + formatNumber(value);
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
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
            <div class="token-balance">${formatTokenAmount(balances[token], token)}</div>
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
                            <td>${formatTokenAmount(entry.balance, currentToken)}</td>
                            <td class="${entry.change >= 0 ? 'positive' : 'negative'}">
                                ${entry.change >= 0 ? '+' : ''}${formatTokenAmount(entry.change, currentToken)}
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
        await loadDailyGainsTable();
        await loadAPYAnalysis();
        
    } catch (error) {
        showError(`Failed to ${exclude ? 'exclude' : 'include'} day: ` + error.message);
    }
}

// Auto-exclude days with more than 1% change for all wallets
async function autoExcludeOutliers() {
    if (!confirm('This will automatically exclude all days with more than 1% change across all wallets. This action cannot be undone easily. Continue?')) {
        return;
    }
    
    try {
        showMessage('Analyzing and excluding outliers...', 'info');
        
        const result = await apiCall('/api/auto-exclude-outliers', {
            method: 'POST'
        });
        
        showMessage(`✅ ${result.message}`, 'success');
        
        // Refresh all data displays
        await loadTokenOverview();
        await loadDailyGains();
        await loadDailyGainsTable();
        await loadAPYAnalysis();
        await loadCompoundProjection();
        
    } catch (error) {
        showMessage(`❌ Error: ${error.message}`, 'error');
    }
}

// Load historical data for all wallets
async function loadAllWalletsHistorical(days = 365) {
    if (wallets.length === 0) {
        showError('No wallets to process');
        return;
    }
    
    const timeEstimate = days <= 7 ? 'a few minutes' : days <= 30 ? '10-20 minutes' : 'up to 2 hours';
    if (!confirm(`This will load ${days} days of historical data for ALL ${wallets.length} wallets. This may take ${timeEstimate}. Continue?`)) {
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    showSuccess(`Starting historical data loading for ${wallets.length} wallets...`);
    
    // Process wallets one by one to avoid overwhelming the server
    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        
        try {
            showSuccess(`Processing wallet ${i + 1}/${wallets.length}: ${shortenAddress(wallet.address)}...`);
            
            const result = await apiCall(`/api/preload-historical/${wallet.address}`, {
                method: 'POST',
                body: JSON.stringify({ days: days })
            });
            
            successCount++;
            showSuccess(`✅ Wallet ${i + 1}/${wallets.length} completed: ${result.daysProcessed} days processed`);
            
            // Small delay between wallets to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            errorCount++;
            showError(`❌ Wallet ${i + 1}/${wallets.length} failed: ${error.message}`);
            
            // Continue with next wallet even if one fails
            continue;
        }
    }
    
    // Final summary
    showSuccess(`Historical loading completed! ✅ ${successCount} successful, ❌ ${errorCount} failed`);
    
    // Reload wallets to reflect new data
    await loadWallets();
}

// Daily gains table functions
async function loadDailyGainsTable() {
    if (selectedWallets.length === 0) {
        document.getElementById('dailyGainsTable').innerHTML = 
            '<div style="text-align: center; color: #666; padding: 40px;">Select wallets to see daily gains table</div>';
        return;
    }
    
    try {
        showLoading('dailyGainsTable');
        
        // Get the number of days from the control (default 30)
        const days = parseInt(document.getElementById('dailyGainsTableDays')?.value) || 30;
        
        const gainsTable = await apiCall('/api/daily-gains-table', {
            method: 'POST',
            body: JSON.stringify({ selectedWallets, days })
        });
        
        renderDailyGainsTable(gainsTable);
    } catch (error) {
        showError('Failed to load daily gains table', 'dailyGainsTable');
    }
}

function renderDailyGainsTable(data) {
    const dailyGainsTable = document.getElementById('dailyGainsTable');
    
    if (!data.dailyGainsTable || data.dailyGainsTable.length === 0) {
        dailyGainsTable.innerHTML = 
            '<div style="text-align: center; color: #666; padding: 40px;">No daily gains data available</div>';
        return;
    }
    
    // Calculate totals
    let totalGainsUSD = 0;
    let positiveGainsDays = 0;
    let negativeGainsDays = 0;
    
    data.dailyGainsTable.forEach(day => {
        if (day.hasData) {
            totalGainsUSD += day.totalGainUSD;
            if (day.totalGainUSD > 0) positiveGainsDays++;
            else if (day.totalGainUSD < 0) negativeGainsDays++;
        }
    });
    
    // Summary stats
    const summaryStats = `
        <div class="daily-gains-summary">
            <div class="summary-stat">
                <span class="summary-label">Total des gains (${data.daysRequested} jours)</span>
                <span class="summary-value ${totalGainsUSD >= 0 ? 'positive' : 'negative'}">${formatCurrency(totalGainsUSD)}</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Jours positifs</span>
                <span class="summary-value positive">${positiveGainsDays} jours</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Jours négatifs</span>
                <span class="summary-value negative">${negativeGainsDays} jours</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Gain moyen/jour</span>
                <span class="summary-value">${formatCurrency(totalGainsUSD / data.daysRequested)}</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Wallets sélectionnés</span>
                <span class="summary-value">${data.walletsCount}</span>
            </div>
        </div>
    `;
    
    // Get all unique tokens from the data
    const allTokens = new Set();
    data.dailyGainsTable.forEach(day => {
        Object.keys(day.tokenGains).forEach(token => allTokens.add(token));
    });
    const tokensList = Array.from(allTokens).sort();
    
    // Create table headers
    const tableHeaders = `
        <thead>
            <tr>
                <th style="position: sticky; left: 0; background: #667eea; z-index: 10;">Date</th>
                <th style="position: sticky; left: 80px; background: #667eea; z-index: 10;">Total USD</th>
                ${tokensList.map(token => `<th>${token}</th>`).join('')}
            </tr>
        </thead>
    `;
    
    // Create table rows
    const tableRows = data.dailyGainsTable.map(day => {
        const isPositive = day.totalGainUSD >= 0;
        const hasData = day.hasData;
        
        return `
            <tr class="${!hasData ? 'no-data' : ''}">
                <td style="position: sticky; left: 0; background: white; z-index: 5; font-weight: 600;">
                    ${day.date}
                </td>
                <td style="position: sticky; left: 80px; background: white; z-index: 5;" 
                    class="${hasData ? (isPositive ? 'positive' : 'negative') : ''}">
                    ${hasData ? formatCurrency(day.totalGainUSD) : '-'}
                </td>
                ${tokensList.map(token => {
                    const tokenGain = day.tokenGains[token] || 0;
                    const hasTokenData = tokenGain !== 0;
                    return `
                        <td class="${hasTokenData ? (tokenGain >= 0 ? 'positive' : 'negative') : ''}">
                            ${hasTokenData ? formatCurrency(tokenGain) : '-'}
                        </td>
                    `;
                }).join('')}
            </tr>
        `;
    }).join('');
    
    const tableHTML = `
        ${summaryStats}
        <div class="table-container">
            <table class="daily-gains-table">
                ${tableHeaders}
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
        <div class="table-footer">
            <small style="color: #666;">
                Prix ETH: $${formatNumber(data.ethPrice)} • 
                Les jours exclus ont des gains de 0$ • 
                Seuls les tokens avec compose:true sont inclus
            </small>
        </div>
    `;
    
    dailyGainsTable.innerHTML = tableHTML;
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
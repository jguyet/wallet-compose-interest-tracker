const ethers = require('ethers');
const { default: Web3 } = require('web3');

const getTokenContract = (tokenAddress, account) => {
    const contratToken = new ethers.Contract(
        tokenAddress,// 2040
        [
            { "inputs": [], "name": "name", "outputs": [ { "internalType": "string", "name": "", "type": "string" } ], "stateMutability": "view", "type": "function", "constant": true },
            { "inputs": [], "name": "symbol", "outputs": [ { "internalType": "string", "name": "", "type": "string" } ], "stateMutability": "view", "type": "function", "constant": true },
            { "inputs": [], "name": "totalSupply", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function", "constant": true },
            { "inputs": [], "name": "decimals", "outputs": [ { "internalType": "uint8", "name": "", "type": "uint8" } ], "stateMutability": "view", "type": "function", "constant": true },
            { "inputs": [{"name": "_owner","type": "address"}],"name": "balanceOf","outputs": [{"name": "balance","type": "uint256"}], "stateMutability": "view", "type": "function", "constant": true}
        ],
        account
    );
    return contratToken;
};

const getTokenBytes32Contract = (tokenAddress, account) => {
    const contratToken = new ethers.Contract(
        tokenAddress,// 2040
        [
            { "inputs": [], "name": "name", "outputs": [ { "internalType": "string", "name": "", "type": "bytes32" } ], "stateMutability": "view", "type": "function", "constant": true },
            { "inputs": [], "name": "symbol", "outputs": [ { "internalType": "string", "name": "", "type": "bytes32" } ], "stateMutability": "view", "type": "function", "constant": true },
        ],
        account
    );
    return contratToken;
}

const catchName = async (tokenAddress, account) => {
    try {
        let contratToken = getTokenContract(tokenAddress, account);
        return await contratToken.name();
    } catch (e) {
        try {
            let contratToken = getTokenBytes32Contract();
            return Web3.utils.toAscii(await contratToken.name());
        } catch (e2) {
            return '';
        } 
    }
}

const catchSymbol = async (tokenAddress, account) => {
    try {
        let contratToken = getTokenContract(tokenAddress, account);
        return await contratToken.symbol();
    } catch (e) {
        try {
            let contratToken = getTokenBytes32Contract();
            return Web3.utils.toAscii(await contratToken.symbol());
        } catch (e2) {
            return '';
        } 
    }
}

const getUniswapV3AmountOut = async (tokenAddress0, tokenAddress1, amountIn, settings, networkName) => {
    const provider = new ethers.providers.JsonRpcProvider({
        url: settings.environement['rpc' + networkName].url,
        name: settings.environement['rpc' + networkName].name,
        chainId: Number(settings.environement['rpc' + networkName].chainId)
    });
    const wallet =  ethers.Wallet.createRandom();
    const account = wallet.connect(provider);
    const factoryV3Contract = new ethers.Contract(
        '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
        [
            { "inputs": [{ "internalType": "address", "name": "", "type": "address" }, { "internalType": "address", "name": "", "type": "address" }, { "internalType": "uint24", "name": "", "type": "uint24" } ], "name": "getPool", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
        ],
        account
    );
    const poolAddress = await factoryV3Contract.getPool(tokenAddress0, tokenAddress1, '10000');
    const poolContract = new ethers.Contract( // Uniswap v3 ABI
        poolAddress,
        [
            { "inputs": [], "name": "liquidity", "outputs": [ { "internalType": "uint128", "name": "", "type": "uint128" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "fee", "outputs": [ { "internalType": "uint24", "name": "", "type": "uint24" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "feeGrowthGlobal0X128", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "feeGrowthGlobal1X128", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "token0", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "token1", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "slot0", "outputs": [ { "internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160" }, { "internalType": "int24", "name": "tick", "type": "int24" }, { "internalType": "uint16", "name": "observationIndex", "type": "uint16" }, { "internalType": "uint16", "name": "observationCardinality", "type": "uint16" }, { "internalType": "uint16", "name": "observationCardinalityNext", "type": "uint16" }, { "internalType": "uint8", "name": "feeProtocol", "type": "uint8" }, { "internalType": "bool", "name": "unlocked", "type": "bool" } ], "stateMutability": "view", "type": "function", "constant": true }
       ],
        account);
    const token0Contract = getTokenContract(tokenAddress0, account);
    const token1Contract = getTokenContract(tokenAddress1, account);
    const token0Decimals = (await token0Contract.decimals()).toString();
    const token1Decimals = (await token1Contract.decimals()).toString();
    const slot0 = await poolContract.slot0();
    const tick = slot0.tick;
    const tickOfPrice = 1.0001 ** tick;

    console.log(Number(slot0.sqrtPriceX96.mul(slot0.sqrtPriceX96).mul(ethers.BigNumber.from("1000000000000000000")).toString()) >> (96 * 2));

    // prix d'une unité du token 1 en token 0
    const priceInToken1 = (tickOfPrice * (10 ** (token0Decimals))) / (10 ** token1Decimals);
    // prix d'une unité du token 0 en token 1
    const priceInToken0 = 1 / priceInToken1;


    // si amountIn et en token 0
    const amountOut = amountIn.mul(ethers.utils.parseUnits(priceInToken0.toFixed(18), token0Decimals)).div(ethers.utils.parseUnits('1', token0Decimals));

    // si amountIn et en token 1
    //const amountOut = amountIn.mul(ethers.utils.parseUnits(priceInToken1.toFixed(18), token1Decimals)).div(ethers.utils.parseUnits('1', token1Decimals));

    return amountOut;
};

const getUniswapV3Information = async (pairAddress, settings, networkName) => {
    const provider = new ethers.providers.JsonRpcProvider({
        url: settings.environement['rpc' + networkName].url,
        name: settings.environement['rpc' + networkName].name,
        chainId: Number(settings.environement['rpc' + networkName].chainId)
    });
    const wallet =  ethers.Wallet.createRandom();
    const account = wallet.connect(provider);
    const poolAddress = pairAddress;
    const poolContract = new ethers.Contract( // Uniswap v3 ABI
        poolAddress,
        [
            { "inputs": [], "name": "liquidity", "outputs": [ { "internalType": "uint128", "name": "", "type": "uint128" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "fee", "outputs": [ { "internalType": "uint24", "name": "", "type": "uint24" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "feeGrowthGlobal0X128", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "feeGrowthGlobal1X128", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "token0", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "token1", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
            { "inputs": [], "name": "slot0", "outputs": [ { "internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160" }, { "internalType": "int24", "name": "tick", "type": "int24" }, { "internalType": "uint16", "name": "observationIndex", "type": "uint16" }, { "internalType": "uint16", "name": "observationCardinality", "type": "uint16" }, { "internalType": "uint16", "name": "observationCardinalityNext", "type": "uint16" }, { "internalType": "uint8", "name": "feeProtocol", "type": "uint8" }, { "internalType": "bool", "name": "unlocked", "type": "bool" } ], "stateMutability": "view", "type": "function", "constant": true }
       ],
        account);
    // Récupérer la liquidité totale dans le pool
    let liquidity = await poolContract.liquidity();
    // recuperer le pourcentage de frais
    let fee = await poolContract.fee();
    // Récupérer le taux de croissance des frais collectés pour token0 et token1
    let feeGrowth0 = await poolContract.feeGrowthGlobal0X128();
    let feeGrowth1 = await poolContract.feeGrowthGlobal1X128();

    // Calculer le montant total des frais collectés
    // console.log(liquidity, feeGrowth0, feeGrowth1);
    const feeTotal0 = (liquidity.toString() * feeGrowth0.toString() / Number(2n**128n)).toLocaleString('fullwide', {useGrouping:false}).split(',')[0];
    const feeTotal1 = (liquidity.toString() * feeGrowth1.toString() / Number(2n**128n)).toLocaleString('fullwide', {useGrouping:false}).split(',')[0];

    const tokenAddress0 = await poolContract.token0();
    const tokenAddress1 = await poolContract.token1();

    const token0Contract = getTokenContract(tokenAddress0, account);
    const token1Contract = getTokenContract(tokenAddress1, account);

    let informations = {
        token0: {
            address: tokenAddress0,
            name: await catchName(tokenAddress0, account),
            symbol: await catchSymbol(tokenAddress0, account),
            totalSupply: (await token0Contract.totalSupply()).toString(),
            decimals: (await token0Contract.decimals()).toString(),
            balance: (await token0Contract.balanceOf(poolAddress)).toString()
        },
        token1: {
            address: tokenAddress1,
            name: await catchName(tokenAddress1, account),
            symbol: await catchSymbol(tokenAddress1, account),
            totalSupply: (await token1Contract.totalSupply()).toString(),
            decimals: (await token1Contract.decimals()).toString(),
            balance: (await token1Contract.balanceOf(poolAddress)).toString()
        },
        collected: {
            token0: feeTotal0,
            token1: feeTotal1
        },
        fee: fee.toString()
    };

    let slot0 = await poolContract.slot0();
    let tick = slot0.tick;
    let tickOfPrice = 1.0001 ** tick;
    let priceInToken1 = (tickOfPrice * (10 ** (informations.token0.decimals))) / (10 ** informations.token1.decimals);
    let priceInToken0 = 1 / priceInToken1;

    informations.token0.priceInToken1 = priceInToken1;
    informations.token1.priceInToken0 = priceInToken0;


    // console.log(informations, priceInToken0, priceInToken1);

    // console.log(`Frais collectés pour token0 (${informations.token0.name}):`, ethers.utils.formatUnits(informations.collected.token0, informations.token0.decimals));
    // console.log(`Frais collectés pour token1 (${informations.token1.name}):`, ethers.utils.formatUnits(informations.collected.token1, informations.token1.decimals));

    return informations;
};

module.exports = {
    getUniswapV3Information,
    getUniswapV3AmountOut
};
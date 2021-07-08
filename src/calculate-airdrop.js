require('dotenv').config();

const path = require('path');
const { providers, Contract, BigNumber } = require('ethers');
const ObjectsToCsv = require('objects-to-csv');
const csvToJson = require('csvtojson');

const provider = new providers.JsonRpcProvider(process.env.ETH_RPC_URL);

const rewardsAbi = [
    'event RewardPaid(address indexed account, uint256 reward)',
    'event Staked(address indexed account, uint256 amount)',
    'function earned(address account) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
];
const mplAbi = ['event Transfer(address indexed from, address indexed to, uint256 value)'];

const ORTHOGONAL_REWARDS = '0x7869D7a3B074b5fa484dc04798E254c9C06A5e90';
const MPL = '0x33349B282065b0284d756F0577FB39c158F935e6';
const GOVERNOR = '0xd6d4Bcde6c816F17889f1Dd3000aF0261B03a196';

const mpl = new Contract(MPL, mplAbi, provider);

// Derived from: 2 MPL / 100 USD / 180 days == x MPL / totalStaked / dTime 
// Note: Units work out since totalStaked is denominated in WAD
const getTheoreticalRewards = (totalStaked, dTime) => {
    return BigNumber.from('2')
        .mul(totalStaked)
        .mul(BigNumber.from(dTime.toString()))
        .div(BigNumber.from('100'))
        .div(BigNumber.from((180 * 86400).toString()));
};

function addAddressInInput(array, address, i) {
    const found = array.some(element => element.address === address);
    if (!found) array.push({ name: `DeFi User ${i}`, address });
    return array;
  }

const calcAirdrop = async (inputFilename, outputFilename, rewardsAddress, airdropTransferAddress, currentTimestamp) => {
    let inputData = await csvToJson().fromFile(path.resolve(__dirname, 'csv', inputFilename));

    const rewardsContract = new Contract(rewardsAddress, rewardsAbi, provider);

    // Get all stake events for all users for the given rewardsContract
    const allStakeFilter = rewardsContract.filters.RewardPaid();
    const allStakeEvents = await rewardsContract.queryFilter(allStakeFilter);
    const allAddresses = [...new Set(allStakeEvents.map(obj => obj.args.account))];  // Get all addresses and remove duplicates

    for (let i = 0; i < allAddresses.length - 1; i++) addAddressInInput(inputData, allAddresses[i], i)

    let outputData = await Promise.all(
        inputData.map(async (user) => {
            // Get all reward claims from the user for the given pool
            const rewardPaidFilter = rewardsContract.filters.RewardPaid(user.address);
            const rewardPaidEvents = await rewardsContract.queryFilter(rewardPaidFilter);
            const totalClaimed = rewardPaidEvents.reduce((total, obj, i, []) => {
                return total.add(obj.args.reward);
            }, BigNumber.from('0'));

            // Get all MPL transferred from the governor address to account for past airdrops
            const transferFilter = mpl.filters.Transfer(airdropTransferAddress, user.address);
            const transferEvents = await mpl.queryFilter(transferFilter);
            const totalAirdropped = transferEvents.reduce((total, obj, i, []) => {
                return total.add(obj.args.value);
            }, BigNumber.from('0'));

            // Get unclaimed MPL rewards for the user for the given pool
            const earnings = (await rewardsContract.functions.earned(user.address))[0];

            // Get all stake events and amounts to use for theoretical MPL amount calculation
            const stakeFilter = rewardsContract.filters.Staked(user.address);
            const stakeEvents = await rewardsContract.queryFilter(stakeFilter);
            const totalTheoreticalRewards = await stakeEvents.reduce(async (total, obj, i, []) => {
                const { timestamp: stakeTimestamp } = await provider.getBlock(obj.blockNumber);
                return (await total).add(getTheoreticalRewards(obj.args.amount, currentTimestamp - stakeTimestamp));
            }, BigNumber.from('0'));

            const rewardsOwed = totalTheoreticalRewards.sub(totalClaimed).sub(totalAirdropped).sub(earnings);

            return {
                name: user.name,
                address: user.address,
                earnings: earnings.toString(),
                totalClaimed: totalClaimed.toString(),
                totalAirdropped: totalAirdropped.toString(),
                totalTheoreticalRewards: totalTheoreticalRewards.toString(),
                rewardsOwed: rewardsOwed.toString(),
                rewardsOwedNormalized: parseInt(rewardsOwed.toString()) / 1e18,
            };
        })
    );

    // console.log({outputData})

    // Save to file
    const csv = new ObjectsToCsv(outputData);
    await csv.toDisk(path.resolve(__dirname, 'csv', outputFilename));
};

calcAirdrop('orthogonal-airdrop-input.csv', 'orthogonal-airdrop-output.csv', ORTHOGONAL_REWARDS, GOVERNOR, 1625625208);

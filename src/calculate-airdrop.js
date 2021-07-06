require('dotenv').config()

const path = require('path');
const { providers, Contract, BigNumber } = require('ethers')
const csv = require('csvtojson')


async function main() {

    const provider = new providers.JsonRpcProvider(process.env.ETH_RPC_URL)

    const inputData = await csv().fromFile(path.resolve(__dirname, 'input.csv'));

    const MPL = '0x33349B282065b0284d756F0577FB39c158F935e6';
    const GOVERNOR = '0xd6d4Bcde6c816F17889f1Dd3000aF0261B03a196';
    const ORTHOGONAL_REWARDS = '0x7869D7a3B074b5fa484dc04798E254c9C06A5e90';
    const REWARD_ADDED_TIME_1 = 1621398655;

    const rewardsAbi = [
        'event RewardPaid(address indexed account, uint256 reward)',
        'function earned(address account) external view returns (uint256)',
        'function balanceOf(address account) external view returns (uint256)'
    ];

    const mplAbi = [ 'event Transfer(address indexed from, address indexed to, uint256 value)' ];

    const orthogonalRewards = new Contract(ORTHOGONAL_REWARDS, rewardsAbi, provider);
    const mpl = new Contract(MPL, mplAbi, provider);

    const { timestamp: blockTimestamp } = await provider.getBlock();

    let outputData = await Promise.all(inputData.map(async user => {

        // Get all reward claims from the user for the given pool
        const rewardPaidFilter = orthogonalRewards.filters.RewardPaid(user.Address)
        const rewardPaidEvents = await orthogonalRewards.queryFilter(rewardPaidFilter)

        // Get all MPL transferred from the governor address to account for past airdrops
        const transferFilter = mpl.filters.Transfer(GOVERNOR, user.Address)
        const transferEvents = await mpl.queryFilter(transferFilter)

        // Get unclaimed MPL rewards for the user for the given pool
        const earnings = (await orthogonalRewards.functions.earned(user.Address))[0]

        // Parse and sum the total claimed MPL from events
        const totalClaimed = rewardPaidEvents.reduce((total, obj, i, []) => {
            return total.add(obj.args.reward)
        }, BigNumber.from('0'))

        // Parse and sum the total transferred MPL from events
        const totalAirdropped = transferEvents.reduce((total, obj, i, []) => {
            return total.add(obj.args.value)
        }, BigNumber.from('0'))

        const totalStaked = (await orthogonalRewards.functions.balanceOf(user.Address))[0]

        const timePassed = blockTimestamp - REWARD_ADDED_TIME_1;  // TODO: Should timestamp be an input?

        // TODO: Add comment
        const theoreticalRewards = 
            BigNumber.from('2')
                .mul(totalStaked)
                .mul(BigNumber.from(timePassed.toString()))
                .div(BigNumber.from('100'))
                .div(BigNumber.from((180 * 86400).toString()))

        const rewardsOwed = theoreticalRewards.sub(totalClaimed).sub(totalAirdropped).sub(earnings)

        return {
            name: user.Name,
            address: user.Address,
            earnings: earnings.toString(),
            totalClaimed: totalClaimed.toString(),
            totalAirdropped: totalAirdropped.toString(),
            theoreticalRewards: theoreticalRewards.toString(),
            rewardsOwed: rewardsOwed.toString()
        }
    }))

    console.dir(outputData, {depth: null})
}

main();



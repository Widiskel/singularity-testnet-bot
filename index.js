import { privateKey } from "./accounts/accounts.js";
import Core from "./src/core/core.js";
import sqlite from "./src/core/db/sqlite.js";
import { SINGULARITY_RPC } from "./src/core/network/rpc.js";
import { Helper } from "./src/utils/helper.js";
import logger from "./src/utils/logger.js";
import twist from "./src/utils/twist.js";

async function operation(acc) {
  await sqlite.connectToDatabase();
  await sqlite.createTable();
  const core = new Core(acc);
  try {
    await core.connectWallet();
    await core.getBalance();

    if (
      core.singularityBalance.find((item) => item.SYMBOL == "SFI").BALANCE < 1
    )
      throw Error(`Minimum Balance is 1 ${SINGULARITY_RPC.SYMBOL}`);

    await core.getAccountInfo(true);
    // let wrapCount = (await sqlite.getTodayTxLog(core.address, "WRAP")).length;
    // while (wrapCount < 2) {
    //   await core.deposit();
    //   await core.withdraw();
    //   wrapCount = (await sqlite.getTodayTxLog(core.address, "WRAP")).length;
    // }

    // let bridgeCount = (await sqlite.getTodayTxLog(core.address, "BRIDGE"))
    //   .length;
    // while (bridgeCount < 5) {
    //   await core.bridge();
    //   bridgeCount = (await sqlite.getTodayTxLog(core.address, "BRIDGE")).length;
    // }

    let stakeCount = (await sqlite.getTodayTxLog(core.address, "STAKE")).length;
    while (stakeCount < 2) {
      await core.stake();
      stakeCount = (await sqlite.getTodayTxLog(core.address, "STAKE")).length;
    }

    let claimStake = (await sqlite.getTodayTxLog(core.address, "CLAIM")).length;
    while (claimStake < 2) {
      await core.claimStake();
      claimStake = (await sqlite.getTodayTxLog(core.address, "CLAIM")).length;
    }

    let unstakeCount = (await sqlite.getTodayTxLog(core.address, "UNSTAKE"))
      .length;
    while (unstakeCount < 1) {
      await core.unstake();
      unstakeCount = (await sqlite.getTodayTxLog(core.address, "UNSTAKE"))
        .length;
    }

    let swapCount = (await sqlite.getTodayTxLog(core.address, "SWAP")).length;
    while (swapCount < 3) {
      await core.swap();
      swapCount = (await sqlite.getTodayTxLog(core.address, "SWAP")).length;
    }

    let addLiquidityCount = (
      await sqlite.getTodayTxLog(core.address, "ADDLIQUIDITY")
    ).length;
    while (addLiquidityCount < 1) {
      await core.addLiquidity();
      addLiquidityCount = (
        await sqlite.getTodayTxLog(core.address, "ADDLIQUIDITY")
      ).length;
    }

    let removeLiquidityCount = (
      await sqlite.getTodayTxLog(core.address, "REMOVELIQUIDITY")
    ).length;
    while (removeLiquidityCount < 1) {
      await core.removeLiquidity();
      removeLiquidityCount = (
        await sqlite.getTodayTxLog(core.address, "REMOVELIQUIDITY")
      ).length;
    }

    const delay = 60000 * 60 * 24;
    await Helper.delay(
      delay,
      acc,
      `Account ${
        privateKey.indexOf(acc) + 1
      } Processing Done, Delaying for ${Helper.msToTime(delay)}`,
      core
    );
    await operation(acc);
  } catch (error) {
    if (error.message) {
      await Helper.delay(
        10000,
        acc,
        `Error : ${error.message}, Retry again after 10 Second`,
        core
      );
    } else {
      await Helper.delay(
        10000,
        acc,
        `Error :${JSON.stringify(error)}, Retry again after 10 Second`,
        core
      );
    }

    await operation(acc);
  }
}

async function startBot() {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info(`BOT STARTED`);
      if (privateKey.length == 0)
        throw Error("Please input your account first on accounts.js file");
      const promiseList = [];

      for (const acc of privateKey) {
        promiseList.push(operation(acc));
      }

      await Promise.all(promiseList);
      resolve();
    } catch (error) {
      logger.info(`BOT STOPPED`);
      logger.error(JSON.stringify(error));
      reject(error);
    }
  });
}

(async () => {
  try {
    logger.clear();
    logger.info("");
    logger.info("Application Started");
    Helper.showSkelLogo();
    console.log("SINGULARITY TESTNET BOT");
    console.log("By : Widiskel");
    console.log("Follow On : https://github.com/Widiskel");
    console.log("Join Channel : https://t.me/skeldrophunt");
    console.log("Dont forget to run git pull to keep up to date");
    await startBot();
  } catch (error) {
    twist.clear();
    twist.clearInfo();
    console.log("Error During executing bot", error);
    await startBot();
  }
})();

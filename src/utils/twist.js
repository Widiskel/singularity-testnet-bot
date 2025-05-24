import { Twisters } from "twisters";
import logger from "./logger.js";
import Core from "../core/core.js";
import { privateKey } from "../../accounts/accounts.js";
import { Config } from "../../config/config.js";
import sqlite from "../core/db/sqlite.js";

class Twist {
  constructor() {
    /** @type  {Twisters}*/
    this.twisters = new Twisters();
  }

  /**
   * @param {string} acc
   * @param {Core} core
   * @param {string} msg
   * @param {string} delay
   */
  async log(msg = "", acc = "", core = new Core(), delay) {
    const accIdx = privateKey.indexOf(acc);
    if (delay == undefined) {
      logger.info(`Account ${accIdx + 1} - ${msg}`);
      delay = "-";
    }

    const address = core.address ?? "-";
    const sepoliaBalance = core.sepoliaBalance ?? [];
    const singularityBalance = core.singularityBalance ?? [];
    const userData = core.userData ?? {};
    const todayPoint = userData.pointsEarnedToday ?? "?";
    const totalPoints = userData.totalPoints ?? "?";

    const todayWrap = (await sqlite.getTodayTxLog(core.address, "WRAP")).length;
    const todayBridge = (await sqlite.getTodayTxLog(core.address, "BRIDGE"))
      .length;
    const todayStake = (await sqlite.getTodayTxLog(core.address, "STAKE"))
      .length;
    const todayClaimStake = (await sqlite.getTodayTxLog(core.address, "CLAIM"))
      .length;
    const todayUnstake = (await sqlite.getTodayTxLog(core.address, "UNSTAKE"))
      .length;
    const todaySwap = (await sqlite.getTodayTxLog(core.address, "SWAP")).length;
    const todayAddLiquidity = (
      await sqlite.getTodayTxLog(core.address, "ADDLIQUIDITY")
    ).length;
    const todayRemoveLiquidity = (
      await sqlite.getTodayTxLog(core.address, "REMOVELIQUIDITY")
    ).length;

    this.twisters.put(acc, {
      text: `
================== Account ${accIdx + 1} =================
Address              : ${address}
Points (Today|Total) : ${todayPoint}|${totalPoints}
Balance              :
SINGULARITY NETWORK  : ${singularityBalance.map((item) => {
        return `\n- ${item.BALANCE} ${item.SYMBOL}`;
      })}

Today Stake            : ${todayStake} / 2
Today Claim Stake      : ${todayClaimStake} / 2 
Today Unstake          : ${todayUnstake} / 1
Today Swap             : ${todaySwap} / 3
Today Add Liquidity    : ${todayAddLiquidity} / 1
Today Remove Liquidity : ${todayRemoveLiquidity} / 1
      
Status : ${msg}
Delay : ${delay}
==============================================`,
    });
  }
  /**
   * @param {string} msg
   */
  info(msg = "") {
    this.twisters.put(2, {
      text: `
==============================================
Info : ${msg}
==============================================`,
    });
    return;
  }

  clearInfo() {
    this.twisters.remove(2);
  }

  clear(acc) {
    this.twisters.remove(acc);
  }
}
export default new Twist();

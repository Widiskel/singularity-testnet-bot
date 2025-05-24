import { ethers } from "ethers";
import { privateKey } from "../../accounts/accounts.js";
import { Helper } from "../utils/helper.js";
import logger from "../utils/logger.js";
import { SEPOLIA_RPC, SINGULARITY_RPC } from "./network/rpc.js";
import { Config } from "../../config/config.js";
import { API } from "../api/api.js";
import sqlite from "./db/sqlite.js";
import { TOKENLIST } from "./contract/erc20_token_list.js";
import { L2ToL1MessagePasser } from "./contract/l2tol1_message_passer.js";
import { SDAOLockedStaking } from "./contract/sdao_locked_staking.js";
import { proxyList } from "../../config/proxy_list.js";
import { UNISWAPROUTER } from "./contract/uniswap_router.js";
import { LIQUIDITYTOKENPAIRLIST } from "./contract/liquidity_token_pair.js";

export default class Core extends API {
  constructor(acc) {
    const accIdx = privateKey.indexOf(acc);
    if (proxyList.length != privateKey.length && proxyList.length != 0)
      throw Error(
        `You Have ${privateKey.length} Accounts But Provide ${proxyList.length} Proxy`
      );
    const proxy = proxyList[accIdx];

    super(proxy);
    this.acc = acc;
    this.sepoliaProvider = new ethers.JsonRpcProvider(
      SEPOLIA_RPC.RPC,
      SEPOLIA_RPC.CHAIN_ID
    );
    this.singularityProvider = new ethers.JsonRpcProvider(
      SINGULARITY_RPC.RPC,
      SINGULARITY_RPC.CHAIN_ID
    );
  }

  async connectWallet() {
    try {
      const data = this.acc;
      const accIdx = privateKey.indexOf(this.acc);
      await Helper.delay(
        1000,
        this.acc,
        `Connecting to Account : ${accIdx + 1}`,
        this
      );
      const type = Helper.determineType(data);
      logger.info(`Account Type : ${type}`);
      if (type == "Secret Phrase") {
        /**
         * @type {Wallet}
         */
        this.sepoliaWallet = ethers.Wallet.fromPhrase(
          data,
          this.sepoliaProvider
        );
        this.singularityWallet = ethers.Wallet.fromPhrase(
          data,
          this.singularityProvider
        );
      } else if (type == "Private Key") {
        /**
         * @type {Wallet}
         */
        this.sepoliaWallet = new ethers.Wallet(
          data.trim(),
          this.sepoliaProvider
        );
        this.singularityWallet = new ethers.Wallet(
          data.trim(),
          this.singularityProvider
        );
      } else {
        throw Error("Invalid account Secret Phrase or Private Key");
      }
      this.address = this.sepoliaWallet.address;
      await Helper.delay(
        1000,
        this.acc,
        `Wallet connected ${JSON.stringify(this.address)}`,
        this
      );
    } catch (error) {
      throw error;
    }
  }

  async getBalance(msg = false) {
    try {
      if (msg) {
        await Helper.delay(
          500,
          this.acc,
          `Getting Wallet Balance of ${this.wallet.address}`,
          this
        );
      }

      const ethSepoliaBalance = ethers.formatEther(
        await this.sepoliaProvider.getBalance(this.address)
      );

      this.sepoliaBalance = [
        { SYMBOL: SEPOLIA_RPC.SYMBOL, BALANCE: ethSepoliaBalance },
      ];

      const ethSingularityBalance = ethers.formatEther(
        await this.singularityProvider.getBalance(this.address)
      );
      const wsfiContract = new ethers.Contract(
        TOKENLIST.WSFI,
        TOKENLIST.ABI,
        this.singularityProvider
      );
      const usdcContract = new ethers.Contract(
        TOKENLIST.USDC,
        TOKENLIST.ABI,
        this.singularityProvider
      );
      this.singularityBalance = [
        { SYMBOL: SINGULARITY_RPC.SYMBOL, BALANCE: ethSingularityBalance },
        {
          SYMBOL: `W${SINGULARITY_RPC.SYMBOL}`,
          BALANCE: ethers.formatEther(
            await wsfiContract.balanceOf(this.address)
          ),
        },
        {
          SYMBOL: `USDC`,
          BALANCE: ethers.formatEther(
            await usdcContract.balanceOf(this.address)
          ),
        },
      ];
      if (msg) await Helper.delay(500, this.acc, `Balance updated`, this);
    } catch (error) {
      throw error;
    }
  }
  async getAccountInfo(msg = false) {
    try {
      if (msg) {
        await Helper.delay(
          500,
          this.acc,
          `Getting Account Information ...`,
          this
        );
      }

      const res = await this.fetch(
        `https://sfi-l2-backend.singularityfinance.ai/api/l2-backend/dashboard?walletAddress=${this.address}`
      );
      if (res.status == 200) {
        this.userData = res.data;
        if (msg)
          await Helper.delay(
            500,
            this.acc,
            `Successfully Get Account Information`,
            this
          );
      } else {
        if (res.status == 429) {
          await Helper.delay(500, this.acc, `To many Request`, this);
        } else {
          throw res;
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async deposit() {
    try {
      const contract = new ethers.Contract(
        TOKENLIST.WSFI,
        TOKENLIST.ABI,
        this.singularityWallet
      );

      await Helper.delay(500, this.acc, `Try To Wrap SFI Token to WSFI`, this);
      const amountInWei = ethers.parseEther(Config.TXAMOUNT.toString());
      const data = await contract.deposit.populateTransaction();

      const tx = await this.buildTxBody(
        data,
        amountInWei,
        this.singularityProvider
      );

      await this.executeTx(
        tx,
        this.singularityProvider,
        this.singularityWallet
      );

      await Helper.delay(
        500,
        this.acc,
        `Successfully Wrap SFI Token to WSFI`,
        this
      );
    } catch (error) {
      throw error;
    }
  }

  async withdraw() {
    try {
      await Helper.delay(500, this.acc, `Trying to Unwrap WSFI to SFI`, this);

      const contract = new ethers.Contract(
        TOKENLIST.WSFI,
        TOKENLIST.ABI,
        this.singularityWallet
      );
      const wsfiBalance = await contract.balanceOf(this.address);
      const amountInWei = wsfiBalance;
      const amountInEth = ethers.formatEther(amountInWei);
      if (amountInEth == 0) {
        await Helper.delay(500, this.acc, `No WSFI token to Unwrap`, this);
        return;
      }
      logger.info(`Unwrapping ${amountInEth} WSFI To SFI`);

      const data = contract.withdraw.populateTransaction(amountInWei);
      const tx = await this.buildTxBody(data, 0, this.singularityProvider);

      await this.executeTx(
        tx,
        this.singularityProvider,
        this.singularityWallet
      );

      await sqlite.insertData(this.address, "WRAP");
      await Helper.delay(
        500,
        this.acc,
        `Successfully Unswarp ${amountInEth} WSFI Token to SFI`,
        this
      );
    } catch (error) {
      throw error;
    }
  }

  async bridge() {
    await Helper.delay(
      500,
      this.acc,
      `Trying to Bridge from Singularity to Sepolia`,
      this
    );
    const implementationContract = new ethers.Contract(
      L2ToL1MessagePasser.CONTRACTADDRESS,
      L2ToL1MessagePasser.ABI,
      this.singularityWallet
    );
    const amountInWei = ethers.parseEther(Config.TXAMOUNT.toString());

    const data =
      await implementationContract.initiateWithdrawal.populateTransaction(
        this.address,
        21000,
        "0x"
      );
    const tx = await this.buildTxBody(
      data,
      amountInWei,
      this.singularityProvider,
      L2ToL1MessagePasser.PROXYCONTRACT
    );
    const wdTx = await this.executeTx(
      tx,
      this.singularityProvider,
      this.singularityWallet
    );
    // const approveTx = await this.buildTxBody(
    //   data,
    //   amountInWei,
    //   this.singularityProvider,
    //   L2ToL1MessagePasser.PROXYCONTRACT
    // );

    sqlite.insertData(this.address, "BRIDGE");
    await Helper.delay(
      500,
      this.acc,
      `Successfully Bridge ${amountInWei} SFI from Singularity to Sepolia`,
      this
    );
  }

  async stake() {
    if (
      this.singularityBalance.find((item) => item.SYMBOL == "WSFI").BALANCE <= 0
    ) {
      await this.deposit();
    }
    const contract = new ethers.Contract(
      TOKENLIST.WSFI,
      TOKENLIST.ABI,
      this.singularityWallet
    );
    const amountInWei = ethers.parseEther(Config.TXAMOUNT.toString());

    const proxyContract = new ethers.Contract(
      SDAOLockedStaking.PROXYCONTRACT,
      SDAOLockedStaking.ABI,
      this.singularityWallet
    );
    await this.tokenApproval(
      await contract.getAddress(),
      SDAOLockedStaking.PROXYCONTRACT
    );
    const amountInEth = ethers.formatEther(amountInWei);
    await Helper.delay(
      500,
      this.acc,
      `Trying to Stake ${amountInEth} WSFI`,
      this
    );

    const userInfo = await proxyContract.userInfo(this.address);
    let lockPeriod;
    const days = 90;
    const secondsInADay = 24 * 60 * 60;
    const initialLockPeriod = days * secondsInADay;
    const lockDate = Number(userInfo[1]);
    const unlockDate = Number(userInfo[2]);

    if (lockDate == 0) {
      lockPeriod = initialLockPeriod;
    } else {
      lockPeriod = unlockDate - lockDate - 205;
    }
    // console.log(lockPeriod);
    const data = await proxyContract.deposit.populateTransaction(
      amountInWei,
      lockPeriod
    );

    const tx = await this.buildTxBody(
      data,
      undefined,
      this.singularityProvider,
      SDAOLockedStaking.PROXYCONTRACT
    );

    await this.executeTx(tx, this.singularityProvider, this.singularityWallet);
    await sqlite.insertData(this.address, "STAKE");
    await Helper.delay(
      500,
      this.acc,
      `Successfully Bridge ${amountInWei} from Singularity to Sepolia`,
      this
    );
  }
  async claimStake() {
    const proxyContract = new ethers.Contract(
      SDAOLockedStaking.PROXYCONTRACT,
      SDAOLockedStaking.ABI,
      this.singularityWallet
    );
    const reward = await proxyContract.pending();
    if (Number(reward) == 0) {
      await Helper.delay(
        60000 * 5,
        this.acc,
        `No Staking Balance to claim, Please wait until stake is claimable `,
        this
      );
    }
    const amountInEth = ethers.formatEther(reward);
    await Helper.delay(
      500,
      this.acc,
      `Trying to Claim ${amountInEth} WSFI from Staking Reward`,
      this
    );

    const data = await proxyContract.claim.populateTransaction();
    const tx = await this.buildTxBody(
      data,
      undefined,
      this.singularityProvider,
      SDAOLockedStaking.PROXYCONTRACT
    );

    await this.executeTx(tx, this.singularityProvider, this.singularityWallet);
    await sqlite.insertData(this.address, "CLAIM");
    await Helper.delay(
      500,
      this.acc,
      `Successfully Claim Stake of ${amountInEth} WSFI `,
      this
    );
  }
  async unstake() {
    const proxyContract = new ethers.Contract(
      SDAOLockedStaking.PROXYCONTRACT,
      SDAOLockedStaking.ABI,
      this.singularityWallet
    );
    const userInfo = await proxyContract.userInfo(this.address);
    const amountInWei = ethers.parseEther("0.001");
    const amountInEth = ethers.formatEther(amountInWei);
    if (Number(userInfo[0]) <= 0) {
      await Helper.delay(3000, this.acc, `No Staking Balance to Unstake`, this);
      await this.stake();
      return;
    } else {
      await Helper.delay(
        3000,
        this.acc,
        `Try to Unstaking some WSFI from available ${amountInEth}`,
        this
      );
    }

    await Helper.delay(
      500,
      this.acc,
      `Trying to Unstake ${amountInEth} WSFI from Staking Pool`,
      this
    );

    const data = await proxyContract.withdraw.populateTransaction(amountInWei);
    const tx = await this.buildTxBody(
      data,
      undefined,
      this.singularityProvider,
      SDAOLockedStaking.PROXYCONTRACT
    );

    await this.executeTx(tx, this.singularityProvider, this.singularityWallet);
    await sqlite.insertData(this.address, "UNSTAKE");
    await Helper.delay(
      500,
      this.acc,
      `Successfully Unstake ${amountInEth} WSFI `,
      this
    );
  }
  async swap() {
    const amountInWei = ethers.parseEther(Config.TXAMOUNT.toString());
    const amountInEth = Config.TXAMOUNT.toString();
    await Helper.delay(
      500,
      this.acc,
      `Try To Swap ${amountInEth} ${SINGULARITY_RPC.SYMBOL} to ? USDC`,
      this
    );
    const router = new ethers.Contract(
      UNISWAPROUTER.CONTRACTADDRESS,
      UNISWAPROUTER.ABI,
      this.singularityWallet
    );

    const swapPath = [TOKENLIST.WSFI, TOKENLIST.USDC];

    const amountOut = await this.calculateSwapOutput(
      router,
      amountInWei,
      swapPath
    );
    const amountOutEth = ethers.formatEther(amountOut);
    await Helper.delay(
      500,
      this.acc,
      `Try To Swap ${amountInEth} ${SINGULARITY_RPC.SYMBOL} to ${amountOutEth} USDC`,
      this
    );
    const data =
      await router.swapExactETHForTokensSupportingFeeOnTransferTokens.populateTransaction(
        amountOut,
        swapPath,
        this.address,
        Helper.calculateDeadlineTx()
      );

    const tx = await this.buildTxBody(
      data,
      amountInWei,
      this.singularityProvider
    );
    await this.executeTx(tx, this.singularityProvider, this.singularityWallet);
    await sqlite.insertData(this.address, "SWAP");
    await Helper.delay(
      500,
      this.acc,
      `Successfully Swap ${amountInEth} ${SINGULARITY_RPC.SYMBOL} to ${amountOutEth} USDC`,
      this
    );
  }

  async calculateSwapOutput(router, amount, path) {
    const data = await router.getAmountsOut(amount, path);
    const result = data[1] - (data[1] % 10n ** 14n);

    return result;
  }

  async addLiquidity() {
    const amountInWei = ethers.parseEther(Config.TXAMOUNT.toString());
    const amountInEth = Config.TXAMOUNT.toString();
    await Helper.delay(
      500,
      this.acc,
      `Try To Add ${amountInEth} ${SINGULARITY_RPC.SYMBOL} to ${SINGULARITY_RPC.SYMBOL}/USDC Liquidity Pool `,
      this
    );

    const router = new ethers.Contract(
      UNISWAPROUTER.CONTRACTADDRESS,
      UNISWAPROUTER.ABI,
      this.singularityWallet
    );

    await this.tokenApproval(TOKENLIST.USDC, await router.getAddress());

    const swapPath = [TOKENLIST.WSFI, TOKENLIST.USDC];
    const amountOut = await this.calculateSwapOutput(
      router,
      amountInWei,
      swapPath
    );
    const slippage = 95n; //5% slippage
    const amountTokenMin = (amountOut * slippage) / 100n;
    const amountETHMin = (amountInWei * slippage) / 100n;
    const deadline = Helper.calculateDeadlineTx();

    const data = await router.addLiquidityETH.populateTransaction(
      TOKENLIST.USDC,
      amountInWei,
      amountTokenMin,
      amountETHMin,
      this.address,
      deadline
    );

    const tx = await this.buildTxBody(
      data,
      amountInWei,
      this.singularityProvider
    );
    await this.executeTx(tx, this.singularityProvider, this.singularityWallet);
    await sqlite.insertData(this.address, "ADDLIQUIDITY");
    await Helper.delay(
      500,
      this.acc,
      `Successfully To Add ${amountInEth} ${SINGULARITY_RPC.SYMBOL} to ${SINGULARITY_RPC.SYMBOL}/USDC Liquidity Pool `,
      this
    );
  }

  async removeLiquidity() {
    await Helper.delay(
      500,
      this.acc,
      `Try To Remove 10% From ${SINGULARITY_RPC.SYMBOL}/USDC Liquidity Pool`,
      this
    );

    const router = new ethers.Contract(
      UNISWAPROUTER.CONTRACTADDRESS,
      UNISWAPROUTER.ABI,
      this.singularityWallet
    );

    const lpPair = new ethers.Contract(
      LIQUIDITYTOKENPAIRLIST.CITREALP,
      LIQUIDITYTOKENPAIRLIST.ABI,
      this.singularityWallet
    );
    const lpBalance = await lpPair.balanceOf(this.address);
    const liquidityAmountToRemove = (lpBalance * 10n) / 100n;
    await this.tokenApproval(
      LIQUIDITYTOKENPAIRLIST.CITREALP,
      await router.getAddress()
    );

    const reserves = await lpPair.getReserves();
    const reserveA = reserves[0];
    const reserveB = reserves[1];

    const totalSupply = await lpPair.totalSupply();
    const amountTokenA = (reserveA * liquidityAmountToRemove) / totalSupply;
    const amountTokenB = (reserveB * liquidityAmountToRemove) / totalSupply;

    const slippage = 5n;
    const amountAMin = (amountTokenA * 100n) / (slippage * 100n);
    const amountBMin = (amountTokenB * 100n) / (slippage * 100n);

    const deadline = Helper.calculateDeadlineTx();

    const data = await router.removeLiquidity.populateTransaction(
      TOKENLIST.WSFI,
      TOKENLIST.USDC,
      liquidityAmountToRemove,
      amountAMin,
      amountBMin,
      this.address,
      deadline
    );

    const tx = await this.buildTxBody(data, 0, this.singularityProvider);

    await this.executeTx(tx, this.singularityProvider, this.singularityWallet);
    await sqlite.insertData(this.address, "REMOVELIQUIDITY");
    await Helper.delay(
      500,
      this.acc,
      `Successfully Removed 10% of ${SINGULARITY_RPC.SYMBOL}/USDC Liquidity Pool`,
      this
    );
  }

  async tokenApproval(tokenCA, spenderCA) {
    if (!(await sqlite.isSpenderExists(this.address, tokenCA, spenderCA))) {
      await Helper.delay(
        1000,
        this.acc,
        `Try To Approving 
Token : ${tokenCA} 
Spender : ${spenderCA} `,
        this
      );
      const contract = new ethers.Contract(
        tokenCA,
        TOKENLIST.ABI,
        this.singularityWallet
      );
      const approval = await contract.approve(spenderCA, ethers.MaxUint256);
      await approval.wait();
      await sqlite.insertApprovalData(this.address, tokenCA, spenderCA);
      await Helper.delay(1000, this.acc, `Token Approved`, this);
    }
  }

  /**
   *
   * @param {ethers.Transaction} tx
   * @param {ethers.JsonRpcProvider} provider
   * @param {ethers.Wallet} signer
   */
  async executeTx(tx, provider, signer) {
    // console.log(tx);
    try {
      logger.info(`TX DATA ${JSON.stringify(Helper.serializeBigInt(tx))}`);
      const explorer =
        (await provider.getNetwork()).chainId == SEPOLIA_RPC.CHAIN_ID
          ? SEPOLIA_RPC.EXPLORER
          : SINGULARITY_RPC.EXPLORER;

      await Helper.delay(500, this.acc, `Executing TX...`, this);
      const txRes = await signer.sendTransaction(tx);
      if (Config.WAITFORBLOCKCONFIRMATION) {
        logger.info(`Tx Executed \n${explorer}tx/${txRes.hash}`);
        await Helper.delay(
          500,
          this.acc,
          `Tx Executed Waiting For Block Confirmation...`,
          this
        );
        const txRev = await this.waitWithTimeout(
          txRes,
          provider,
          signer,
          5 * 60 * 1000
        ); // 5 minutes timeout

        logger.info(`Tx Confirmed and Finalizing: ${JSON.stringify(txRev)}`);
        await Helper.delay(
          5000,
          this.acc,
          `Tx Executed and Confirmed \n${explorer}tx/${txRev.hash}`,
          this
        );
      } else {
        await Helper.delay(500, this.acc, `Tx Executed...`, this);
        await Helper.delay(
          5000,
          this.acc,
          `Tx Executed \n${explorer}tx/${txRes.hash}`,
          this
        );
      }

      await this.getBalance();
    } catch (error) {
      if (error.message.includes("504")) {
        await Helper.delay(5000, this.acc, error.message, this);
      } else {
        logger.error(`Error in executing transaction: ${error.message}`);
        throw error;
      }
    }
  }

  async waitWithTimeout(txRes, provider, signer, timeout) {
    let timedOut = false;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        reject(
          new Error("Transaction confirmation timed out after 5 minutes.")
        );
      }, timeout);
    });

    try {
      const txRev = await Promise.race([txRes.wait(), timeoutPromise]);
      return txRev;
    } catch (error) {
      if (timedOut) {
        logger.warn("Re-executing transaction due to timeout.");
        return this.executeTx(txRes, provider, signer); // Re-execute the transaction
      }
      throw error;
    }
  }

  /**
   *
   * @param {ethers.JsonRpcProvider} provider
   */
  async getOptimalNonce(provider) {
    try {
      const latestNonce = await provider.getTransactionCount(
        this.address,
        "latest"
      );
      const pendingNonce = await provider.getTransactionCount(
        this.address,
        "pending"
      );
      const optimalNonce =
        pendingNonce > latestNonce ? pendingNonce : latestNonce;
      return optimalNonce;
    } catch (error) {
      throw error;
    }
  }

  /**
   *
   * @param {ethers.JsonRpcProvider} provider
   */
  async estimateGasWithRetry(
    provider,
    address,
    amount,
    rawdata,
    directThrow = false,
    retries = 3,
    delay = 3000
  ) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        logger.info(`Estimating Gas for ${rawdata} TX`);
        const gasLimit = await provider.estimateGas({
          from: this.address,
          to: address,
          value: amount,
          data: rawdata,
        });
        // console.log(gasLimit);
        return gasLimit;
      } catch (err) {
        if (directThrow) {
          throw err;
        } else {
          await Helper.delay(
            delay,
            this.acc,
            `${err.reason}... Attempt ${attempt + 1} of ${retries}`,
            this
          );

          if (attempt === retries - 1) {
            throw Error(`Failed to estimate gas after ${retries} attempts.`);
          }
        }
      }
    }
  }

  /**
   *
   * @param {ethers.JsonRpcProvider} provider
   */
  async buildTxBody(
    data,
    value = 0,
    provider,
    to = undefined,
    estimateGas = true
  ) {
    const nonce = await this.getOptimalNonce(provider);
    /**
     * @type {ethers.Transaction}
     */
    let tx;
    if (estimateGas) {
      const gasLimit = await this.estimateGasWithRetry(
        provider,
        to ? to : data.to,
        value,
        data.data
      );

      tx = {
        to: to ? to : data.to,
        from: this.address,
        value: value,
        gasLimit,
        // gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
        nonce: nonce,
        data: data.data,
      };
    } else {
      tx = {
        to: data.to,
        from: this.address,
        value: value,
        // gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
        nonce: nonce,
        data: data.data,
      };
    }

    return tx;
  }
}

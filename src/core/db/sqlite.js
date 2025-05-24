import sqlite3 from "sqlite3";
import { open } from "sqlite";

class SQLITE {
  async connectToDatabase() {
    return open({
      filename: "./database.db",
      driver: sqlite3.Database,
    });
  }

  async createTable() {
    const db = await this.connectToDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tx_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        tx_date DATE NOT NULL,
        type TEXT
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS approve_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        token_address TEXT NOT NULL,
        spender TEXT NOT NULL
      )
    `);

    await db.close();
  }

  async insertData(address, type) {
    const txDate = new Date().toISOString();
    const db = await this.connectToDatabase();
    await db.run(
      "INSERT INTO tx_log (address, tx_date, type) VALUES (?, ?, ?)",
      [address, txDate, type]
    );
    await db.close();
  }

  async insertApprovalData(address, tokenCa, spender) {
    const db = await this.connectToDatabase();
    await db.run(
      "INSERT INTO approve_log (address,token_address, spender) VALUES (?, ?, ?)",
      [address, tokenCa, spender]
    );
    await db.close();
  }

  async getTodayTxLog(address, type) {
    const db = await this.connectToDatabase();
    const todayISO = new Date().toISOString().split("T")[0];
    const todayTxLog = await db.all(
      `
      SELECT * FROM tx_log
      WHERE DATE(tx_date) = ? AND address = ? AND type = ?
      ORDER BY tx_date DESC
    `,
      [todayISO, address, type]
    );

    await db.close();

    return todayTxLog;
  }

  async isSpenderExists(address, tokenAddress, spender) {
    const db = await this.connectToDatabase();

    const approval = await db.all(
      `
      SELECT * FROM approve_log
      WHERE address = ? AND token_address = ? AND spender = ?
    `,
      [address, tokenAddress, spender]
    );

    await db.close();

    return approval.length > 0;
  }
}

const sqlite = new SQLITE();
await sqlite.createTable();

export default sqlite;

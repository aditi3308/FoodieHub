
require("dotenv").config();

const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function resetPassword() {
  const email = "admin@gmail.com";

  rl.question("Enter your new admin password: ", async (password) => {
    if (!password || password.length < 8) {
      console.log("Password must be at least 8 characters.");
      rl.close();
      return;
    }

    let connection;

    try {
      connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "foodiehub"
      });

      const hashedPassword = await bcrypt.hash(password, 12);

      const [result] = await connection.execute(
        "UPDATE users SET password = ?, role = 'admin' WHERE email = ?",
        [hashedPassword, email]
      );

      if (result.affectedRows === 1) {
        console.log("Admin password reset successfully!");
        console.log("Admin email:", email);
        console.log("You can now log in.");
      } else {
        console.log("Account not found. Check the email address.");
      }

    } catch (error) {
      console.log("Error:", error.message);
    } finally {
      if (connection) await connection.end();
      rl.close();
    }
  });
}

resetPassword();

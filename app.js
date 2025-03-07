const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const fs = require('fs');
const pino = require('pino');
const { exec } = require('child_process');
const qrcode = require('qrcode-terminal');

const app = express();
const port = 31;

const logger = pino({
  level: 'silent',
  customLevels: {
    trace: 10000,
    debug: 10000,
    info: 10000,
    warn: 10000,
    error: 10000,
    fatal: 10000,
  },
});

let openedSocket = false;
let chat_count = 0;
const sessionPath = './session/';

const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

app.use(express.json());

app.post('/start-session', async (req, res) => {
  const { phoneNumber, qrLogin } = req.body;

  try {
    if (qrLogin) {
      await genQR(true);
    } else if (phoneNumber) {
      await loginWithPhone(phoneNumber);
    }

    res.status(200).send('Session started successfully.');

  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to start session.');
  }
});

async function genQR(qr) {
  let { version } = await fetchLatestBaileysVersion();
  let { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  let sock = makeWASocket({
    logger,
    auth: state,
    version: version,
    getMessage: async (key) => {},
  });

  if (!qr && !sock.authState.creds.registered) {
    console.log("You must use QR code to login.");
    process.exit(1);
  }

  sock.ev.on('connection.update', async (update) => {
    let { connection, qr: qrCode } = update;
    if (qrCode) {
      qrcode.generate(qrCode, { small: true });
    }
    if (connection === 'open') {
      console.clear();
      if (!openedSocket) {
        openedSocket = true;
        try {
          const chats = await sock.groupFetchAllParticipating();
          chat_count = Object.keys(chats).length;
        } catch (err) {}
      }

      console.log('WhatsApp connected successfully');
      exec('pm2 start index.js --name "session--kullanıcıadı"', (err, stdout, stderr) => {
        if (err) {
          console.error(`Error executing pm2: ${stderr}`);
          return;
        }
        console.log(`PM2 Output: ${stdout}`);
      });
    } else if (connection === 'close') {
      console.log('Connection closed');
      await genQR(qr);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

async function loginWithPhone(phoneNumber) {
  let { version } = await fetchLatestBaileysVersion();
  let { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  let sock = makeWASocket({
    logger,
    auth: state,
    version: version,
    getMessage: async (key) => {},
  });

  try {
    sock.ev.on('connection.update', async (update) => {
      let { connection } = update;
      if (connection === 'open') {
        console.log('Successfully logged in with phone number!');
        exec('pm2 start index.js --name "session--kullanıcıadı"', (err, stdout, stderr) => {
          if (err) {
            console.error(`Error executing pm2: ${stderr}`);
            return;
          }
          console.log(`PM2 Output: ${stdout}`);
        });
      } else if (connection === 'close') {
        await loginWithPhone(phoneNumber);
      } else if (!connection && !sock.authState.creds.registered) {
        var pairingCode = await sock.requestPairingCode(phoneNumber);
        pairingCode = pairingCode.slice(0, 4) + '-' + pairingCode.slice(4);
        console.log(`Your WhatsApp pairing code: ${pairingCode}`);
        console.log('Enter this code on your WhatsApp app under "Linked Devices".');
      }
    });

    sock.ev.on('creds.update', saveCreds);
  } catch (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }
}
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

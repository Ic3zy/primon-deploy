const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');

const app = express();
const port = 3000; 

const logger = require('pino')({
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

const sessionBasePath = path.join(__dirname, 'sessions');

app.use(express.json());

app.post('/start-process', async (req, res) => {
  const { repoUrl, branchName, username } = req.body;

  if (!repoUrl || !branchName || !username) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const sessionPath = path.join(sessionBasePath, username);

  try {
    await execPromise(`git clone https://----`);

    await execPromise(`cd ${sessionPath} && npm install`);

    await generateSession(sessionPath, username);

    res.status(200).json({ message: 'Process completed successfully.' });
  } catch (error) {
    console.error('Error during process:', error);
    res.status(500).json({ error: 'An error occurred during the process.' });
  }
});

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing command: ${stderr}`);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function generateSession(sessionPath, username) {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const sock = makeWASocket({
    logger,
    auth: state,
    version: version,
    getMessage: async (key) => {},
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection } = update;
    if (connection === 'open') {
      console.log(`Session for ${username} is open.`);
    } else if (connection === 'close') {
      console.log(`Session for ${username} is closed.`);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

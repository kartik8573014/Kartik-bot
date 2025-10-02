const express = require('express');
const multer = require('multer');
const login = require('ws3-fca');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

const upload = multer({ dest: 'uploads/' });

let botConfig = null;
let apiInstance = null;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/start-bot', upload.single('appstate'), async (req, res) => {
    try {
        const { prefix, adminID } = req.body;
        if (!req.file || !prefix || !adminID) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        let appState;
        try {
            appState = JSON.parse(fs.readFileSync(req.file.path));
            fs.unlinkSync(req.file.path);
        } catch (error) {
            return res.status(400).json({ success: false, message: 'Invalid appstate.json file' });
        }

        botConfig = { appState, prefix, adminID };
        await startBot(botConfig);

        res.json({ success: true, message: 'Bot started successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/stop-bot', (req, res) => {
    if (!apiInstance) {
        return res.json({ success: false, message: 'Bot is not running' });
    }
    apiInstance.logout(() => {
        apiInstance = null;
        botConfig = null;
        res.json({ success: true, message: 'Bot stopped successfully' });
    });
});

async function startBot({ appState, prefix, adminID }) {
    if (apiInstance) throw new Error('Bot is already running');

    return new Promise((resolve, reject) => {
        login({ appState }, (err, api) => {
            if (err) return reject(err);

            console.log('✅ Bot is running...');
            api.setOptions({ listenEvents: true });
            apiInstance = api;

            const lockedGroups = {};
            const lockedNicknames = {};
            const lockedDPs = {};
            const lockedThemes = {};
            const lockedEmojis = {};

            api.listenMqtt((err, event) => {
                if (err) return console.error('❌ Listen error:', err);

                if (event.type === 'message' && event.body?.startsWith(prefix)) {
                    const senderID = event.senderID;
                    const args = event.body.slice(prefix.length).trim().split(' ');
                    const command = args[0]?.toLowerCase();
                    const input = args.slice(1).join(' ');

                    if (senderID !== adminID) {
                        return api.sendMessage('❌ Unauthorized', event.threadID);
                    }

                    if (command === 'help') {
                        api.sendMessage('🔐 Command list: grouplockname, nicknamelock, groupdplock, groupthemeslock, groupemojilock, tid, uid', event.threadID);
                    }

                    if (command === 'tid') api.sendMessage(`Group UID: ${event.threadID}`, event.threadID);
                    if (command === 'uid') api.sendMessage(`Your UID: ${senderID}`, event.threadID);
                }
            });

            resolve();
        });
    });
}

app.listen(PORT, () => console.log(`🌐 Running on http://0.0.0.0:${PORT}`));

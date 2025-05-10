require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const schedule = require('node-schedule');
const axios = require('axios');

// Handle uncaught exceptions and promise rejections
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message, error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason.message || reason);
});

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMembers
    ]
});

const CHANNEL_ID = process.env.CHANNEL_ID || '1369351236327051456';
const GUILD_ID = process.env.GUILD_ID || '1270161104357560431';
const BACKEND_URL = 'https://sr-tracker-backend.onrender.com/api/streaks';

let isClientReady = false;
let pendingTriggers = [];

// Leaderboard update function
async function updateLeaderboard() {
    if (!isClientReady) {
        console.log('Client not ready, queuing leaderboard update...');
        pendingTriggers.push(updateLeaderboard);
        return;
    }

    console.log('Starting leaderboard update...');
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error(`Guild not found with ID: ${GUILD_ID}. Available guilds:`, client.guilds.cache.map(g => ({ id: g.id, name: g.name })));
            return;
        }

        const channel = guild.channels.cache.get(CHANNEL_ID);
        if (!channel) {
            console.error(`Channel not found with ID: ${CHANNEL_ID}. Available channels:`, guild.channels.cache.map(c => ({ id: c.id, name: c.name })));
            return;
        }

        // Fetch leaderboard data
        let leaderboardData;
        try {
            const response = await axios.get(BACKEND_URL, { timeout: 15000 });
            leaderboardData = response.data;
            console.log('Fetched leaderboard data:', leaderboardData);
        } catch (error) {
            console.error('Error fetching leaderboard data:', error.message);
            if (error.response) {
                console.error('Backend API response status:', error.response.status);
                console.error('Backend API response data:', error.response.data);
            }
            await channel.send('⚠️ Error fetching leaderboard data. Please try again later.');
            return;
        }

        // Collect display names
        const leaderboardWithDisplayNames = [];
        for (const entry of leaderboardData) {
            try {
                let searchUsername = entry.username.startsWith('@') ? entry.username.slice(1) : entry.username;
                const member = guild.members.cache.find(
                    m => m.user.username.toLowerCase() === searchUsername.toLowerCase()
                );
                leaderboardWithDisplayNames.push({
                    ...entry,
                    displayName: member ? member.displayName : entry.username
                });
            } catch (error) {
                console.error(`Error processing ${entry.username}:`, error.message);
                leaderboardWithDisplayNames.push({
                    ...entry,
                    displayName: entry.username
                });
            }
        }

        // Format and post the leaderboard
        if (!leaderboardWithDisplayNames || leaderboardWithDisplayNames.length === 0) {
            await channel.send('🏆 **Rossbased SR Tracker Leaderboard** 🏆\n\nNo streaks recorded yet. Join the leaderboard in the SR Tracker app!');
            console.log('No leaderboard data to post');
            return;
        }

        let leaderboardMessage = '🏆 **Rossbased SR Tracker Leaderboard** 🏆\n\n';
        leaderboardWithDisplayNames.slice(0, 10).forEach((entry, index) => {
            const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔢';
            leaderboardMessage += `${rankEmoji} ${index + 1}. ${entry.displayName} - ${entry.streak} days\n`;
        });
        leaderboardMessage += `\nUpdated on ${new Date().toLocaleString()} 🔥`;

        // Delete previous leaderboard message
        try {
            const messages = await channel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(msg => msg.author.id === client.user.id);
            if (botMessages.size > 0) {
                await Promise.all(botMessages.map(msg => msg.delete()));
                console.log('Deleted previous leaderboard messages');
            }
        } catch (error) {
            console.error('Error deleting previous messages:', error.message);
        }

        // Send the new leaderboard
        await channel.send(leaderboardMessage);
        console.log('Leaderboard updated successfully');
    } catch (error) {
        console.error('Error in leaderboard update:', error.message, error.stack);
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Fetch guild members to populate cache
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            await guild.members.fetch();
            console.log('Guild members fetched successfully');
        } else {
            console.error(`Guild not found on ready with ID: ${GUILD_ID}`);
        }
    } catch (error) {
        console.error('Error fetching guild members:', error.message);
    }

    isClientReady = true;

    // Execute any pending triggers
    while (pendingTriggers.length > 0) {
        const trigger = pendingTriggers.shift();
        console.log('Executing queued leaderboard update...');
        await trigger();
    }

    // Schedule the leaderboard update hourly
    schedule.scheduleJob('0 * * * *', updateLeaderboard);
});

client.on('error', (error) => {
    console.error('Discord Client Error:', error.message);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    console.error('Failed to login to Discord:', error.message);
    process.exit(1);
});

// Export for manual triggering
module.exports = { updateLeaderboard };

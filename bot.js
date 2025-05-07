require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const schedule = require('node-schedule');
const axios = require('axios');

// Handle uncaught exceptions and promise rejections to prevent crashes
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

const CHANNEL_ID = '1369351236327051456'; // Leaderboard channel ID
const GUILD_ID = '1270161104357560431'; // Server (guild) ID
const BACKEND_URL = 'https://sr-tracker-backend.onrender.com/api/streaks';

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Fetch guild members to populate cache
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            await guild.members.fetch();
            console.log('Guild members fetched successfully');
        }
    } catch (error) {
        console.error('Error fetching guild members:', error.message);
    }

    // Schedule the leaderboard update to run every 5 minutes for testing
    schedule.scheduleJob('*/5 * * * *', async () => {
        console.log('Starting scheduled leaderboard update...');
        try {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) {
                console.error('Guild not found with ID:', GUILD_ID);
                return;
            }

            const channel = guild.channels.cache.get(CHANNEL_ID);
            if (!channel) {
                console.error('Leaderboard channel not found with ID:', CHANNEL_ID);
                return;
            }

            // Fetch the leaderboard data
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
                return;
            }

            // Update nicknames and collect display names
            const leaderboardWithDisplayNames = [];
            for (const entry of leaderboardData) {
                try {
                    // Normalize username: remove @ and convert to lowercase for comparison
                    let searchUsername = entry.username.startsWith('@') ? entry.username.slice(1) : entry.username;

                    // Find member by username
                    const member = guild.members.cache.find(
                        m => m.user.username.toLowerCase() === searchUsername.toLowerCase()
                    );
                    if (member) {
                        const baseName = searchUsername;
                        try {
                            await member.setNickname(`${baseName} [Streak: ${entry.streak}]`);
                            console.log(`Updated nickname for ${entry.username} to ${baseName} [Streak: ${entry.streak}]`);
                        } catch (error) {
                            console.error(`Error updating nickname for ${entry.username}:`, error.message);
                        }
                        leaderboardWithDisplayNames.push({
                            ...entry,
                            displayName: member.displayName || entry.username
                        });
                    } else {
                        console.log(`Member ${entry.username} not found in guild; available usernames:`, 
                            guild.members.cache.map(m => `${m.user.username} (display: ${m.displayName})`).join(', '));
                        leaderboardWithDisplayNames.push({
                            ...entry,
                            displayName: entry.username
                        });
                    }
                } catch (error) {
                    console.error(`Error processing ${entry.username}:`, error.message);
                    leaderboardWithDisplayNames.push({
                        ...entry,
                        displayName: entry.username
                    });
                }
            }

            // Format and post the leaderboard using display names
            if (!leaderboardData || leaderboardData.length === 0) {
                await channel.send('No leaderboard data available at this time.');
                console.log('No leaderboard data to post');
                return;
            }

            let leaderboardMessage = '🏆 **Rossbased SR Tracker Leaderboard** 🏆\n\n';
            leaderboardWithDisplayNames.forEach((entry, index) => {
                leaderboardMessage += `${index + 1}. ${entry.displayName} - ${entry.streak} days\n`;
            });
            leaderboardMessage += `\nUpdated on ${new Date().toLocaleDateString()}`;

            // Delete the previous leaderboard message if it exists
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
            console.error('Error in scheduled leaderboard update:', error.message, error.stack);
        }
    });
});

client.on('error', (error) => {
    console.error('Discord Client Error:', error.message);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    console.error('Failed to login to Discord:', error.message);
    process.exit(1);
});
require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const schedule = require('node-schedule');
const axios = require('axios');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMembers
    ]
});

const CHANNEL_ID = '1369351236327051456'; // Replace with your leaderboard channel ID
const GUILD_ID = '1270161104357560431'; // Replace with your server (guild) ID
const BACKEND_URL = 'https://sr-tracker-backend.onrender.com/api/leaderboard';

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Schedule the leaderboard update to run daily at midnight
    schedule.scheduleJob('0 0 * * *', async () => {
        try {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) {
                console.error('Guild not found');
                return;
            }

            const channel = guild.channels.cache.get(CHANNEL_ID);
            if (!channel) {
                console.error('Leaderboard channel not found');
                return;
            }

            // Fetch the leaderboard data
            const response = await axios.get(BACKEND_URL);
            const leaderboardData = response.data;

            // Update nicknames for all users in the leaderboard data
            for (const entry of leaderboardData) {
                try {
                    const member = guild.members.cache.find(m => m.user.tag === entry.username);
                    if (member) {
                        const baseName = entry.username.split('#')[0]; // Extract username without discriminator
                        await member.setNickname(`${baseName} [Streak: ${entry.streak}]`);
                        console.log(`Updated nickname for ${entry.username} to ${baseName} [Streak: ${entry.streak}]`);
                    } else {
                        console.log(`Member ${entry.username} not found in guild`);
                    }
                } catch (error) {
                    console.error(`Error updating nickname for ${entry.username}:`, error.message);
                }
            }

            // Format and post the leaderboard
            if (!leaderboardData || leaderboardData.length === 0) {
                channel.send('No leaderboard data available at this time.');
                return;
            }

            let leaderboardMessage = '🏆 **Rossbased SR Tracker Leaderboard** 🏆\n\n';
            leaderboardData.forEach((entry, index) => {
                leaderboardMessage += `${index + 1}. ${entry.username} - ${entry.streak} days\n`;
            });
            leaderboardMessage += `\nUpdated on ${new Date().toLocaleDateString()}`;

            // Delete the previous leaderboard message if it exists
            const messages = await channel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(msg => msg.author.id === client.user.id);
            if (botMessages.size > 0) {
                await Promise.all(botMessages.map(msg => msg.delete()));
            }

            // Send the new leaderboard
            await channel.send(leaderboardMessage);
            console.log('Leaderboard updated successfully');
        } catch (error) {
            console.error('Error updating leaderboard:', error.message);
        }
    });
});

client.login(process.env.DISCORD_BOT_TOKEN);
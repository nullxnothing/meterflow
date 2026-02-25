import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';
config();

const commands = [
  new SlashCommandBuilder()
    .setName('ca')
    .setDescription('Get the $INFINITE contract address'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
  console.log('Registering slash commands...');

  // Register globally (works in all servers the bot is in)
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands },
  );

  console.log('Slash commands registered globally.');
} catch (err) {
  console.error('Failed to register commands:', err);
}

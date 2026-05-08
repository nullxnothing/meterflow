import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';
config();

const commands = [
  new SlashCommandBuilder()
    .setName('ca')
    .setDescription('Get current Meterflow payment and settlement info'),
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Submit a bug report or issue')
    .addStringOption(opt =>
      opt.setName('issue')
        .setDescription('Describe the issue you are experiencing')
        .setRequired(true)),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
  console.log('Registering slash commands...');

  // Register to specific guild (instant) + globally (up to 1hr propagation)
  if (process.env.GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log('Slash commands registered to guild (instant).');
  }

  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands },
  );

  console.log('Slash commands registered globally.');
} catch (err) {
  console.error('Failed to register commands:', err);
}

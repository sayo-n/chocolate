const fs = require('fs');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { TOKEN, CLIENT_ID, allowedUserIds} = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log('✅ Bot is ready.');
  // コマンドを登録
  //await registerGlobalCommands();
});

// スラッシュコマンドの処理

client.on('interactionCreate', async interaction => {

  if (interaction.commandName === 'create-lottery') {
    const title = interaction.options.getString('title');
    const endtimeStr = interaction.options.getString('endtime');
    const endsAt = new Date(endtimeStr);

    if (isNaN(endsAt)) {
      return interaction.reply({ content: '❌ 終了日時の形式が不正です。例: `2025-06-01 18:00`', ephemeral: true });
    }

    const eventId = `${interaction.id}-${Date.now()}`;
    const lotteryData = fs.existsSync('lottery.json') ? JSON.parse(fs.readFileSync('lottery.json', 'utf-8')) : {};
    lotteryData[eventId] = { title, endsAt: endsAt.toISOString(), participants: [] };
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');

    const button = new ButtonBuilder()
      .setCustomId(`lottery_${eventId}`)
      .setLabel('🎟️ 応募する')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: `🎉 **${title}** 応募受付中！\n〆切: ${endsAt.toLocaleString()}\nイベントID: \`${eventId}\``,
      components: [row]
    });
  }

  if (interaction.commandName === 'draw-winner') {if (interaction.commandName === 'draw-winner') {
    const eventId = interaction.options.getString('eventid');
    const winnerCount = interaction.options.getInteger('winners');

    if (!fs.existsSync('lottery.json')) {
      return interaction.reply('❌ イベントデータが存在しません。');
    }

    const lotteryData = JSON.parse(fs.readFileSync('lottery.json', 'utf-8'));
    const event = lotteryData[eventId];

    if (!event) return interaction.reply('❓ 指定されたイベントIDが見つかりません。');

    const now = new Date();
    const endDate = new Date(event.endsAt);
    if (now < endDate) return interaction.reply('⏳ このイベントはまだ終了していません。');

    const participants = event.participants;
    if (!participants || participants.length === 0) {
      delete lotteryData[eventId];
      fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
      return interaction.reply('📭 応募者がいませんでした。');
    }

    const prioritized = Array.isArray(event.prioritized) ? event.prioritized.filter(id => participants.includes(id)) : [];
    const others = participants.filter(id => !prioritized.includes(id));
    const shuffledOthers = others.sort(() => 0.5 - Math.random());

    let winners;
    if (!winnerCount || winnerCount >= participants.length) {
      winners = [...prioritized, ...shuffledOthers];
    } else {
      winners = [...prioritized];
      const remaining = winnerCount - winners.length;
      if (remaining > 0) {
        winners.push(...shuffledOthers.slice(0, remaining));
      }
    }

    const losers = participants.filter(id => !winners.includes(id));
    event.winners = winners;

    lotteryData[eventId] = event;
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
    
    await interaction.reply({
      content:`🎊 **${event.title}** の抽選結果: \n🏆 **当選者（${winners.length}名）**: \n${winners.map(id => `・<@${id}>`).join(' ')} \n😢 **落選者（${losers.length}名）**:\n${losers.length > 0 ? losers.map(id => `・<@${id}>`).join(' ') : '（なし）'}`,
      allowedMentions: { users: [] }});
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('lottery_')) {
    const eventId = interaction.customId.replace('lottery_', '');
    const lotteryData = fs.existsSync('lottery.json') ? JSON.parse(fs.readFileSync('lottery.json', 'utf-8')) : {};
    const event = lotteryData[eventId];

    if (!event) {
      return interaction.reply({ content: '❌ イベントが存在しません。', ephemeral: true });
    }

    const now = new Date();
    const endDate = new Date(event.endsAt);
    if (now > endDate) {
      return interaction.reply({ content: '⌛ 応募期間は終了しています。', ephemeral: true });
    }

    const alreadyApplied = event.participants.includes(interaction.user.id);

    if (alreadyApplied) {
      // 応募済みならキャンセル用ボタンを表示
      const cancelButton = new ButtonBuilder()
        .setCustomId(`cancel_${eventId}`)
        .setLabel('❌ 応募を取り消す')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(cancelButton);

      return interaction.reply({
        content: '📌 すでに応募しています。応募を取り消すには以下のボタンを押してください。',
        components: [row],
        ephemeral: true
      });
    } else {
      // 応募処理
      event.participants.push(interaction.user.id);
      fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');

      return interaction.reply({ content: '✅ 応募を受け付けました！', ephemeral: true });
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('cancel_')) {
    const eventId = interaction.customId.replace('cancel_', '');
    const lotteryData = fs.existsSync('lottery.json') ? JSON.parse(fs.readFileSync('lottery.json', 'utf-8')) : {};
    const event = lotteryData[eventId];

    if (!event) {
      return interaction.reply({ content: '❌ イベントが存在しません。', ephemeral: true });
    }

    const index = event.participants.indexOf(interaction.user.id);
    if (index === -1) {
      return interaction.reply({ content: '❓ 応募していないため、取り消せません。', ephemeral: true });
    }

    event.participants.splice(index, 1);
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');

    return interaction.reply({ content: '🗑️ 応募を取り消しました。', ephemeral: true });
  }

  if (interaction.commandName === 'create-squad') {
    const eventId = interaction.options.getString('id');

    if (!fs.existsSync('lottery.json') || !fs.existsSync('score.json')) {
      return interaction.reply('❌ 必要なファイル（lottery.json または score.json）が存在しません。');
    }

    const lotteryData = JSON.parse(fs.readFileSync('lottery.json', 'utf-8'));
    const scoreData = JSON.parse(fs.readFileSync('score.json', 'utf-8'));

    const event = lotteryData[eventId];
    if (!event || !event.winners) {
      return interaction.reply('❓ 指定されたイベントの当選者が見つかりません。');
    }

    const winners = event.winners;

    const userScores = winners.map(uid => {
      const entry = scoreData[uid];
      return {
        user: uid,
        score: entry?.score ?? 0,
        egg: entry?.egg > 0
      };
    });

    const squad1 = [];
    const squad2 = [];

    const eggUsers = userScores.filter(u => u.egg);
    const nonEggUsers = userScores.filter(u => !u.egg);

    for (let i = 0; i < eggUsers.length; i++) {
      if (squad1.length < 3) {
        squad1.push(eggUsers[i]);
      } else {
        squad2.push(eggUsers[i]);
      }
    }

    const rest = nonEggUsers.concat(squad1.length >= 3 ? [] : eggUsers.slice(squad1.length));
    const sorted = rest.sort((a, b) => b.score - a.score);

    while ((squad1.length < 3 || squad2.length < 3) && sorted.length > 0) {
      const sum1 = squad1.reduce((sum, u) => sum + u.score, 0);
      const sum2 = squad2.reduce((sum, u) => sum + u.score, 0);

      if (sum2 < sum1 && squad2.length < 3) {
        squad2.push(sorted.shift());
      } else if (squad1.length < 3) {
        squad1.push(sorted.shift());
      } else {
        squad2.push(sorted.shift());
      }
    }

    const msg = `**squad1**: ${squad1.map(u => `<@${u.user}>`).join(' ')}\n**squad2**: ${squad2.map(u => `<@${u.user}>`).join(' ')}`;
    await interaction.reply(msg);
  }

  if (interaction.commandName === 'update-score') {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const egg = interaction.options.getNumber('egg');
    const score = interaction.options.getNumber('score');

    if (egg == null || score == null) {
      return interaction.reply({ content: '❌ 入力が不完全です。', ephemeral: true });
    }

   let scoreData = {};
   if (fs.existsSync('score.json')) {
     scoreData = JSON.parse(fs.readFileSync('score.json', 'utf-8'));
   }

   scoreData[user.id] = {
     egg,
     score
   };

   fs.writeFileSync('score.json', JSON.stringify(scoreData, null, 2), 'utf-8');

   return interaction.reply({
     content: `✅ <@${user.id}> のスコアを更新しました。\n・egg: ${egg}\n・score: ${score}`,
     ephemeral: true
   });
  }
  //使用権原必要なコマンド
  if (interaction.commandName === 'prioritize') {
    if (!allowedUserIds.includes(interaction.user.id)) {
      await interaction.reply({ content: '❌ あなたにはこのコマンドの使用権限がありません。', ephemeral: true });
      return;
    }
    const eventId = interaction.options.getString('eventid');
    const user = interaction.options.getUser('user');

    if (!fs.existsSync('lottery.json')) {
      return interaction.reply('❌ イベントデータが存在しません。');
    }

    const lotteryData = JSON.parse(fs.readFileSync('lottery.json', 'utf-8'));
    const event = lotteryData[eventId];

    if (!event) return interaction.reply('❓ 指定されたイベントIDが見つかりません。');

    if (!event.participants.includes(user.id)) {
      return interaction.reply('⚠️ ユーザーはまだイベントに応募していません。');
    }

    if (!event.prioritized) event.prioritized = [];

    if (event.prioritized.includes(user.id)) {
      return interaction.reply('📌 このユーザーはすでに優先対象です。');
    }

    event.prioritized.push(user.id);
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');

    return interaction.reply(`✅ <@${user.id}> を **${event.title}** の優先対象に追加しました。`);
  }
});

// グローバルスラッシュコマンド
async function registerGlobalCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('create-lottery')
      .setDescription('抽選イベントを作成する')
      .addStringOption(opt =>
        opt.setName('title').setDescription('イベントのタイトル').setRequired(true))
      .addStringOption(opt =>
        opt.setName('endtime').setDescription('終了日時（例: 2025-06-01 18:00）').setRequired(true)),

    new SlashCommandBuilder()
      .setName('draw-winner')
      .setDescription('抽選イベントの当選者を抽出する')
      .addStringOption(opt =>
        opt.setName('eventid').setDescription('イベントID').setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('winners').setDescription('当選者数').setRequired(false)),

    new SlashCommandBuilder()
      .setName('prioritize')
      .setDescription('抽選の優先権を与えます。')
      .addStringOption(option => 
        option.setName('eventid').setDescription('イベントID').setRequired(true))
      .addUserOption(option =>
        option.setName('user').setDescription('優先ユーザー').setRequired(true)),

    new SlashCommandBuilder()
      .setName('create-squad')
      .setDescription('squadを作成します。（fahのみ。）')
      .addStringOption(option => 
        option.setName('id').setDescription('イベントID').setRequired(true)),

    new SlashCommandBuilder()
      .setName('update-score')
      .setDescription('ユーザーのegg値とscoreを更新する')
      .addNumberOption(opt =>
        opt.setName('egg').setDescription('eggの数値（例: 1）').setRequired(true))
      .addNumberOption(opt =>
        opt.setName('score').setDescription('scoreの数値（例: 8.7）').setRequired(true))
      .addUserOption(opt =>
        opt.setName('user').setDescription('対象ユーザー').setRequired(false))
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('🌐 グローバルコマンド登録中...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ グローバルコマンド登録完了！反映には最大1時間かかることがあります。');
  } catch (error) {
    console.error('❌ グローバルコマンド登録エラー:', error);
  }
}

client.login(TOKEN);

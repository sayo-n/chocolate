horequire('dotenv').config();
const fs = require('fs');
const {DateTime} = require('luxon');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const TOKEN = process.env.TOKEN, CLIENT_ID = process.env.CLIENT_ID
const {lurerUserIds, allowedRoleIds, usualWinners, hasPincerRole, usualPincer, roles} = require('./config.json');

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
    let endsAt
    try {
      endsAt = parseJSTDate(endtimeStr);
    } catch (error) {
      console.log(error)
      return interaction.reply({
        content: `❌ 終了日時の形式が不正です。\n有効な形式: \`YYYY-MM-DD HH:mm\`、\`MM-DD HH:mm\`、\`HH:mm\`\n例: \`2025-06-01 18:00\``,
        flags: MessageFlags.Ephemeral
      });
    }
    const unixSeconds = Math.floor(endsAt.getTime() / 1000);
    const formatted = `<t:${unixSeconds}:f>`;
    const rqBiome = interaction.options.getString('rqbiome');
    const rqScore = interaction.options.getNumber('rqscore');


    const eventId = `${interaction.id}-${Date.now()}`;
    const channelId = interaction.channel.id;

    const lotteryData = fs.existsSync('lottery.json') ? JSON.parse(fs.readFileSync('lottery.json', 'utf-8')) : {};
    lotteryData[eventId] = { title, endsAt: endsAt.toISOString(), lurer: lurerUserIds, pincer: [], participants: [], volunteer: [], channelId: channelId, ...(rqBiome && { rqBiome }), ...(rqScore && { rqScore }) };

    const button = new ButtonBuilder()
      .setCustomId(`lottery_${eventId}`)
      .setLabel('🎟️ 応募する')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);
    
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`endtime: ${formatted}`)
      .addFields({
        name: 'participants',
        value: '（なし）',
        inline: false
      })
      .setColor('#00b0f4')
      .setFooter({ text: eventId })
    const sent = await interaction.reply({components: [row], embeds: [embed], fetchReply: true });
    lotteryData[eventId].messageId = sent.id;
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');

  }

  if (interaction.commandName === 'draw-winner') {
    const eventId = interaction.options.getString('eventid');
    const winnerCount = interaction.options.getInteger('winners') ?? usualWinners;
    const pincer = interaction.options.getInteger('pincer') ?? usualPincer;

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

    if (!event.winnerLine){
      event.winnerLine = buildWinnerLine(event, pincer);
      lotteryData[eventId] = event;
      fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
    }

    const winners = event.winnerLine.slice(0, winnerCount);
    const losers = event.winnerLine.slice(winnerCount);

    await interaction.reply({
      content:`🎊 **${event.title}** の抽選結果: \n🏆 **メンバー（${winners.length}名）**: \n${winners.map(id => `・<@${id}>`).join(' ')} \n😢 **補欠（${losers.length}名）**:\n${losers.length > 0 ? losers.map(id => `・<@${id}>`).join(' ') : '（なし）'}`,});
  }
  
  if (interaction.isButton() && interaction.customId.startsWith('lottery_')) {
    const eventId = interaction.customId.replace('lottery_', '');
    const lotteryData = fs.existsSync('lottery.json') ? JSON.parse(fs.readFileSync('lottery.json', 'utf-8')) : {};
    const event = lotteryData[eventId];

    if (!event) {
      return interaction.reply({ content: '❌ イベントが存在しません。', flags: MessageFlags.Ephemeral });
    }

    const now = new Date();
    const endDate = new Date(event.endsAt);
    if (now > endDate) {
      return interaction.reply({ content: '⌛ 応募期間は終了しています。', flags: MessageFlags.Ephemeral });
    }

  if (event.rqScore && event.rqBiome) {
    const scoreData = fs.existsSync('score.json') ? JSON.parse(fs.readFileSync('score.json', 'utf-8')) : {};
    const userData = scoreData[interaction.user.id];

    const biomeKey = `score-${event.rqBiome}`;
    const userScore = userData?.[biomeKey] ?? 0;

    if (userScore < event.rqScore) {
    return interaction.reply({
        content: `❌ あなたのスコア（${userScore}）は、このイベントの条件（${event.rqBiome}: ${event.rqScore}）を満たしていません。`,
        flags: MessageFlags.Ephemeral
      });
    }
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
        flags: MessageFlags.Ephemeral
      });
    } else {
      // 応募処理
      event.participants.push(interaction.user.id);
      const Pincer = interaction.member.roles.cache.some(r => hasPincerRole.includes(r.id));
      if (Pincer && !event.pincer.includes(interaction.user.id)){
        event.pincer.push(interaction.user.id);
      }
      // 埋め込み更新
      await updateLotteryEmbed(interaction.channel, eventId, event);
      fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
      return interaction.reply({ content: '✅ 応募を受け付けました！', flags: MessageFlags.Ephemeral });
      
    
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('cancel_')) {
    const eventId = interaction.customId.replace('cancel_', '');
    const lotteryData = fs.existsSync('lottery.json') ? JSON.parse(fs.readFileSync('lottery.json', 'utf-8')) : {};
    const event = lotteryData[eventId];

    if (!event) {
      return interaction.reply({ content: '❌ イベントが存在しません。', flags: MessageFlags.Ephemeral });
    }

    const index = event.participants.indexOf(interaction.user.id);
    if (index === -1) {
      return interaction.reply({ content: '❓ 応募していないため、取り消せません。', flags: MessageFlags.Ephemeral });
    }

    event.participants.splice(index, 1);
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
    await updateLotteryEmbed(interaction.channel, eventId, event);
    return interaction.reply({ content: '🗑️ 応募を取り消しました。', flags: MessageFlags.Ephemeral });
  }
  if (interaction.commandName === 'lottery') {
    const hasRole = interaction.member.roles.cache
      .some(r => allowedRoleIds.includes(r.id));

    if (!hasRole) {
      return interaction.reply({
        content: '❌ 権限がありません。',
        flags: MessageFlags.Ephemeral
      });
    }

    const at = interaction.options.getString('at'); // participants / winners / prioritized / lurer
    const edit = interaction.options.getString('edit'); // add / remove
    const eventId = interaction.options.getString('id');
    const user = interaction.options.getUser('user');

    if (!fs.existsSync('lottery.json')) {
      return interaction.reply('❌ lottery.json が存在しません。');
    }

    const lotteryData = JSON.parse(fs.readFileSync('lottery.json', 'utf-8'));
    const event = lotteryData[eventId];
    if (!event) return interaction.reply('❓ 指定されたイベントIDが見つかりません。');
    const channel = await client.channels.fetch(event.channelId);

    if (!event[at]) event[at] = [];

    const list = event[at];
    const uid = user.id;

    let response = '';

    if (edit === 'add') {
      if (!list.includes(uid)) {
        list.push(uid);
        response = `✅ <@${uid}> を **${at}** に追加しました。`;
      } else {
        response = `⚠️ <@${uid}> はすでに **${at}** に存在します。`;
      }
    } else if (edit === 'remove') {
      if (list.includes(uid)) {
        event[at] = list.filter(id => id !== uid);
        response = `🗑️ <@${uid}> を **${at}** から削除しました。`;
      } else {
        response = `⚠️ <@${uid}> は **${at}** に存在しません。`;
      }
    }
    await updateLotteryEmbed(channel, eventId, event);
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
    return interaction.reply({ content: response, allowedMentions: { users: [] }, });
  } 
  if (interaction.commandName === 'volunteer') {
    const at = 'volunteer';
    const eventId = interaction.options.getString('id');
    const user = interaction.user;

    if (!fs.existsSync('lottery.json')) {
      return interaction.reply('❌ lottery.json が存在しません。');
    }

    const lotteryData = JSON.parse(fs.readFileSync('lottery.json', 'utf-8'));
    const event = lotteryData[eventId];
    if (!event) return interaction.reply('❓ 指定されたイベントIDが見つかりません。');
    const channel = await client.channels.fetch(event.channelId);

    const uid = user.id;

    if (!event[at]) event[at] = [];
    if (!event.participants.includes(uid)) {
      event.participants.push(uid);
    }

    const list = event[at];
    let response = '';

    if (!list.includes(uid)) {
      list.push(uid);
      response = `✅ <@${uid}> を **${at}** に追加しました。`;
    } else {
      response = `⚠️ <@${uid}> はすでに **${at}** に存在します。`;
    }

    await updateLotteryEmbed(channel, eventId, event);
    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
    return interaction.reply({ content: response, allowedMentions: { users: [] }, flags: MessageFlags.Ephemeral});
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
        opt.setName('endtime').setDescription('終了日時（例: 2025-06-01 18:00）').setRequired(true))
      .addStringOption(opt =>
          opt.setName('rqbiome').setDescription('リクエストするBiome（任意）').setRequired(false)
            .addChoices(
              { name: 'Fire Ant Hell', value: 'Fire Ant Hell' },
              { name: 'Ocean', value: 'Ocean' },
              { name: 'Normal Ant Hell', value: 'Normal Ant Hell'},
              { name: 'Desert', value: 'Desert'}
            )
          )
      .addNumberOption(opt =>
        opt.setName('rqscore').setDescription('リクエストスコア（任意）').setRequired(false)),

    new SlashCommandBuilder()
      .setName('draw-winner')
      .setDescription('抽選イベントの当選者を抽出する')
      .addStringOption(opt =>
        opt.setName('eventid').setDescription('イベントID').setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('winners').setDescription('当選者数').setRequired(false))
      .addIntegerOption(opt =>
        opt.setName('pincer').setDescription('Pincer所持者を人数分確定させる').setRequired(false)),
      
    new SlashCommandBuilder()
      .setName('lottery')
      .setDescription('抽選イベントにユーザーを追加/削除する')
      .addStringOption(opt =>
        opt.setName('id').setDescription('イベントID').setRequired(true))
      .addStringOption(opt =>
        opt.setName('at').setDescription('対象フィールド').setRequired(true)
        .addChoices(
          { name: 'participants', value: 'participants' },
          { name: 'x3', value: 'prioritized' },
          { name: 'lurer', value : 'lurer'},
          { name: 'volunteer', value: 'volunteer'}
        )
      )
      .addStringOption(opt =>
        opt.setName('edit').setDescription('操作内容').setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' }
          ))
      .addUserOption(opt =>
        opt.setName('user').setDescription('対象ユーザー').setRequired(true)),
      
    new SlashCommandBuilder()
        .setName('volunteer')
        .setDescription('抽選イベントで必要な数に足りない場合参加する')
        .addStringOption(opt =>
          opt.setName('id').setDescription('イベントID').setRequired(true))

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

function parseJSTDate(inputStr) {
  const now = DateTime.now().setZone('Asia/Tokyo');

  let dt;

  // パターン1: YYYY-MM-DD HH:mm
  if (/^\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}$/.test(inputStr)) {
    dt = DateTime.fromFormat(inputStr, 'yyyy-M-d H:m', { zone: 'Asia/Tokyo' });
  }
  // パターン2: MM-DD HH:mm（年は現在年）
  else if (/^\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}$/.test(inputStr)) {
    dt = DateTime.fromFormat(`${now.year}-${inputStr}`, 'yyyy-M-d H:m', { zone: 'Asia/Tokyo' });
  }
  // パターン3: HH:mm（年月日は現在の日付）
  else if (/^\d{1,2}:\d{1,2}$/.test(inputStr)) {
    dt = DateTime.fromFormat(`${now.toFormat('yyyy-MM-dd')} ${inputStr}`, 'yyyy-MM-dd H:m', { zone: 'Asia/Tokyo' });
    if (dt < now) {
      dt = dt.plus({ days: 1 });
    }
  }
  else {
    throw new Error(`不正な日付形式です: ${inputStr}`);
  }

  if (!dt.isValid) {
    throw new Error(`日付の解析に失敗しました: ${dt.invalidExplanation}`);
  }

  return dt.toUTC().toJSDate();
}

async function updateLotteryEmbed(channel, eventId, event) {
  const message = await channel.messages.fetch(event.messageId).catch(() => null);
  if (!message) return;

  const allParticipants = new Set(event.participants);
  const prioritized = new Set(event.prioritized ?? []);
  const lurer = new Set(event.lurer ?? []);
  const volunteer = new Set(event.volunteer ?? []);
  const pincer = new Set(event.pincer ?? []);

  const lurerList = [...allParticipants].filter(id => lurer.has(id));
  const prioritizedList = [...allParticipants].filter(id => prioritized.has(id) && !lurer.has(id));
  const pincerList = [...allParticipants].filter(id => !prioritized.has(id) && !lurer.has(id) && !volunteer.has(id) && pincer.has(id));
  const regularList = [...allParticipants].filter(id => !prioritized.has(id) && !lurer.has(id) && !volunteer.has(id) && !pincer.has(id));
  const volunteerList = [...allParticipants].filter(id => volunteer.has(id) && !lurer.has(id) && !prioritized.has(id));

  const lines = [
    ...(lurerList.map(id => `<:golden_leaf:1446514092142624828><@${id}>`)),
    ...(prioritizedList.map(id =>`<:uniquechip:1446482108280340551><@${id}>`)),
    ...(pincerList.map(id => `<:pincer:1453218667478257897><@${id}>`)),
    ...(regularList.map(id => ` <:superchip:1446482135287599207><@${id}>`)),
    ...(volunteerList.map(id => `ボ<@${id}>`))
  ];

  const participantText = lines.length > 0 ? lines.join('\n') : '（なし）';

  const unixSeconds = Math.floor(new Date(event.endsAt).getTime() / 1000);
  const formatted = `<t:${unixSeconds}:f>`;

  const embed = new EmbedBuilder()
    .setTitle(event.title)
    .setDescription(`endtime: ${formatted}`)
    .addFields({
      name: `participants (${lines.length})`,
      value: participantText,
      inline: false
    })
    .setColor('#00b0f4')
    .setFooter({ text: eventId })

  await message.edit({ embeds: [embed], fetchReply: true });
}

function buildWinnerLine(event, roleCount) {
  const participants = [...event.participants];

  const isRoleHolder = id => event.pincer?.includes(id);
  const isVolunteer  = id => event.volunteer?.includes(id);

  let roleRemain = roleCount;
  const used = new Set();
  const line = [];

  const push = (id) => {
    if (used.has(id)) return;
    used.add(id);
    line.push(id);
    if (roleRemain > 0 && isRoleHolder(id)) {
      roleRemain--;
    }
  };

  // 1. lurer
  for (const id of event.lurer ?? []) {
    if (participants.includes(id)) push(id);
  }

  // 2. prioritized
  for (const id of event.prioritized ?? []) {
    if (participants.includes(id)) push(id);
  }

  // 通常参加者（volunteer除外）
  const normalRest = participants
    .filter(id => !used.has(id) && !isVolunteer(id))
    .sort(() => 0.5 - Math.random());

  // 3. role枠を満たす（lurer/prioritized で足りていなければ）
  for (const id of normalRest) {
    if (roleRemain <= 0) break;
    if (isRoleHolder(id)) {
      push(id);
    }
  }

  // 4. 通常参加者をすべて追加
  for (const id of normalRest) {
    push(id);
  }

  // 5. volunteer は必ず最後
  const volunteer = (event.volunteer ?? [])
    .filter(id => participants.includes(id))
    .sort(() => 0.5 - Math.random());

  for (const id of volunteer) {
    push(id);
  }

  return line;
}

client.login(TOKEN);

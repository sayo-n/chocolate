require('dotenv').config();
const fs = require('fs');
const {DateTime} = require('luxon');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const TOKEN = process.env.TOKEN, CLIENT_ID = process.env.CLIENT_ID
const {allowedUserIds, lurerUserIds} = require('./config.json');

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

client.on('messageCreate', message => {
  if (message.author.bot) return;

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

    const lotteryData = fs.existsSync('lottery.json') ? JSON.parse(fs.readFileSync('lottery.json', 'utf-8')) : {};
    lotteryData[eventId] = { title, endsAt: endsAt.toISOString(), lurer: lurerUserIds, participants: [], ...(rqBiome && { rqBiome }), ...(rqScore && { rqScore }) };

    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');

    const button = new ButtonBuilder()
      .setCustomId(`lottery_${eventId}`)
      .setLabel('🎟️ 応募する')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);
    let msg = `🎉 **${title}** 応募受付中！\n〆切: ${formatted}\nイベントID: \`${eventId}\``;
    if (rqBiome || rqScore) {
      msg += `\n📌 要件: ${rqBiome ? `Biome: ${rqBiome}` : ''}${rqBiome && rqScore ? ', ' : ''}${rqScore ? `Score: ${rqScore}` : ''}`;
    }
    await interaction.reply({ content: msg, components: [row] });
  }

  if (interaction.commandName === 'draw-winner') {
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

const lurer = Array.isArray(event.lurer) ? event.lurer.filter(id => participants.includes(id)) : [];
const prioritized = Array.isArray(event.prioritized) ? event.prioritized.filter(id => participants.includes(id) && !lurer.includes(id)) : [];
const others = participants.filter(id => !lurer.includes(id) && !prioritized.includes(id));
const shuffledOthers = others.sort(() => 0.5 - Math.random());

let winners = [];

if (!winnerCount || winnerCount >= participants.length) {
  winners = [...lurer, ...prioritized, ...shuffledOthers];
} else {
  winners = [...lurer];
  const remainingAfterSpecial = winnerCount - winners.length;
  
  if (remainingAfterSpecial > 0) {
    winners.push(...prioritized.slice(0, remainingAfterSpecial));
    const remainingAfterPrioritized = winnerCount - winners.length;

    if (remainingAfterPrioritized > 0) {
      winners.push(...shuffledOthers.slice(0, remainingAfterPrioritized));
    }
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

    return interaction.reply({ content: '🗑️ 応募を取り消しました。', flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'create-squad') {
    const eventId = interaction.options.getString('eventid');
    const biome = interaction.options.getString('biome');
    const scoreKey = `score-${biome}`;

    if (!fs.existsSync('lottery.json') || !fs.existsSync('score.json')) {
      return interaction.reply('❌ lottery.json または score.json が見つかりません。');
    }

    const lotteryData = JSON.parse(fs.readFileSync('lottery.json', 'utf-8'));
    const scoreData = JSON.parse(fs.readFileSync('score.json', 'utf-8'));
    const event = lotteryData[eventId];

    if (!event || !event.winners) {
      return interaction.reply('❓ イベントが見つかりません。');
    }

    const winners = event.winners;

    const userScores = winners.map(uid => {
      const entry = scoreData[uid] || {};
      return {
        user: uid,
        egg: entry.egg ?? 0,
        score: entry[scoreKey] ?? 0
      };
    });

    const squad1 = [];
    const squad2 = [];
    const eggUsers = userScores.filter(u => u.egg > 0);
    const nonEggUsers = userScores.filter(u => u.egg === 0);

    const sortedEggUsers = [...eggUsers].sort((a, b) => b.egg - a.egg);

    // 最大3人をsquad1へ
    squad1.push(...sortedEggUsers.slice(0, 3));

      // 4人目以降をsquad2へ
    squad2.push(...sortedEggUsers.slice(3));

    // 残りの人（egg=0）+ 分配しきれなかったeggの人）でスコアバランス分け
    const remaining = nonEggUsers.concat(
      sortedEggUsers.length > 3 ? [] : sortedEggUsers.slice(squad1.length)
    );
    const sorted = [...remaining].sort((a, b) => b.score - a.score);

    // スコアバランスを考慮して squad1/squad2 に振り分け
    while ((squad1.length < 3 || squad2.length < 3) && sorted.length > 0) {
      const sum1 = squad1.reduce((s, u) => s + u.score, 0);
      const sum2 = squad2.reduce((s, u) => s + u.score, 0);

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

    if (interaction.commandName === 'update-inventory') {
    const input = interaction.options.getString('petal');
  const targetUser = interaction.options.getUser('user') ?? interaction.user;

  // 他人の更新には権限が必要
  if (!allowedUserIds.includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ ユーザーの装備を更新する権限がありません。', flags: MessageFlags.Ephemeral });
  }

  const entries = input.split(',').map(e => e.trim());
  const equipmentData = JSON.parse(fs.readFileSync('equipment.json', 'utf-8'));

  const inventory = [];
  const errors = [];
  const seen = new Set();
  
  for (const entry of entries) {
    const match = entry.match(/(Ultra|Super|Unique)\s+([a-zA-Z_]+)\s+(\d+)/i);
    if (!match) {
      errors.push(`❌ フォーマットエラー: "${entry}"`);
      continue;
    }

    const [, rarity, type, countStr] = match;
    const key = `${rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase()} ${type}`;
    const count = parseInt(countStr, 10);

    // 重複チェック
    if (seen.has(key)) {
      errors.push(`❌ 重複した装備があります: ${key}`);
      continue;
    }
    seen.add(key);

    if (!(key in equipmentData)) {
      errors.push(`❌ 未知の装備: "${key}"`);
      continue;
    }

    if (count == 0){
      errors.push(`❌ 所持数エラー: ${entry}`)
    }

    inventory.push({ name: key, count });
  }

  if (errors.length > 0) {
    return interaction.reply({ content: errors.join('\n'), flags: MessageFlags.Ephemeral });
  }

  // スコア計算関数


  // Biome別使用枠制限
  const BIOME_SLOT_LIMITS = {
    "Fire Ant Hell": 8,
    "Normal Ant Hell": 7,
    "Desert": 8,
    "Ocean": 5
  };

  const biomeScores = {};
  const biomeDetails = {};

  for (const [biome, limit] of Object.entries(BIOME_SLOT_LIMITS)) {
    const result = getMaxScoreGreedy(inventory, biome, equipmentData, limit);
    biomeScores[`score-${biome}`] = result.score;
    biomeDetails[biome] = result; // ← usedItems, usedSlots含む
  }


  // 保存処理
  const scoreData = fs.existsSync('score.json') ? JSON.parse(fs.readFileSync('score.json', 'utf-8')) : {};
  if (!scoreData[targetUser.id]) scoreData[targetUser.id] = {};

  scoreData[targetUser.id] = {
    ...scoreData[targetUser.id],
    ...biomeScores,
    inventory
  };

  fs.writeFileSync('score.json', JSON.stringify(scoreData, null, 2), 'utf-8');

  const result = [`✅ Updated <@${targetUser.id}>'s inventory!`, `📦 Inventory:`];

  for (const i of inventory) {
    result.push(`・${i.name} ×${i.count}`);
  }

  result.push(`\n📊 score:`);
  for (const [biome, detail] of Object.entries(biomeDetails)) {
    const label = `score-${biome}`;
    const itemsText = Object.entries(detail.usedItems)
      .map(([name, count]) => `${name} x${count}`)
      .join(', ');
    result.push(`・${label}: ${detail.score} (${detail.usedSlots}) \`\`${itemsText}\`\``);
  }

  return interaction.reply({ content: result.join('\n'), flags: MessageFlags.bitfield=4096});
  }
  //使用権原必要なコマンド
  if (interaction.commandName === 'prioritize') {
    if (!allowedUserIds.includes(interaction.user.id)) {
      await interaction.reply({ content: '❌ あなたにはこのコマンドの使用権限がありません。', flags: MessageFlags.Ephemeral });
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

  if (interaction.commandName === 'lottery') {
    if (!allowedUserIds.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ あなたにはこのコマンドの使用権限がありません。', flags: MessageFlags.Ephemeral });
    }

    const at = interaction.options.getString('at'); // participants / winners / prioritized
    const edit = interaction.options.getString('edit'); // add / remove
    const eventId = interaction.options.getString('id');
    const user = interaction.options.getUser('user');

    if (!fs.existsSync('lottery.json')) {
      return interaction.reply('❌ lottery.json が存在しません。');
    }

    const lotteryData = JSON.parse(fs.readFileSync('lottery.json', 'utf-8'));
    const event = lotteryData[eventId];
    if (!event) return interaction.reply('❓ 指定されたイベントIDが見つかりません。');

    if (!event[at]) event[at] = [];

    const list = event[at];
    const uid = user.id;

    let response = '';

    if (at === 'prioritize') {
      if (!list) list = [];
    }

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

    fs.writeFileSync('lottery.json', JSON.stringify(lotteryData, null, 2), 'utf-8');
    return interaction.reply({ content: response, allowedMentions: { users: [] }});
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
        opt.setName('winners').setDescription('当選者数').setRequired(false)),

    new SlashCommandBuilder()
      .setName('update-inventory')
      .setDescription('インベントリの登録、更新を行う。')
      .addStringOption(option => 
        option.setName('petal')
          .setDescription('ペタル')
          .setRequired(true)
      )
      .addUserOption(option => 
        option.setName('user')
          .setDescription('ユーザー')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('create-squad')
      .setDescription('3+3 squadを作成する。')
      .addStringOption(opt =>
        opt.setName('eventid').setDescription('イベントID').setRequired(true))
      .addStringOption(opt =>
        opt.setName('biome')
          .setDescription('スコアを参照する場所')
          .setRequired(true)
          .addChoices(
            { name: 'Fire Ant Hell', value: 'Fire Ant Hell' },
            { name: 'Ocean', value: 'Ocean' },
            { name: 'Normal Ant Hell', value: 'Normal Ant Hell'},
            { name: 'Desert', value: 'Desert'}
          )),

    new SlashCommandBuilder()
      .setName('lottery')
      .setDescription('抽選イベントにユーザーを追加/削除する')
      .addStringOption(opt =>
        opt.setName('id').setDescription('イベントID').setRequired(true))
      .addStringOption(opt =>
        opt.setName('at').setDescription('対象フィールド').setRequired(true)
        .addChoices(
          { name: 'participants', value: 'participants' },
          { name: 'winners', value: 'winners' },
          { name: 'prioritize', value: 'prioritized' }
        )
      )
      .addStringOption(opt =>
        opt.setName('edit').setDescription('操作内容').setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' }
          ))
      .addUserOption(opt =>
        opt.setName('user').setDescription('対象ユーザー').setRequired(true))

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
  }
  else {
    throw new Error(`不正な日付形式です: ${inputStr}`);
  }

  if (!dt.isValid) {
    throw new Error(`日付の解析に失敗しました: ${dt.invalidExplanation}`);
  }

  return dt.toUTC().toJSDate();
}

function getMaxScoreGreedy(inventory, biome, equipmentData, slotLimit) {
  const fixedItems = [];
  const variableItems = [];

  // golden_leaf をリスト化（slots=1, score=0）
  let goldenLeafItems = [];
  for (const { name, count } of inventory) {
    if (name.toLowerCase().includes('golden_leaf')) {
      for (let i = 0; i < count; i++) {
        goldenLeafItems.push({ name, slot: 1, score: 0 });
      }
    }
  }

  const goldenMultipliers = [1, 1.2, 1.5, 1.9, 2.3, 2.9, 3.6, 4.4, 5.5, 6.8];

  for (const { name, count } of inventory) {
    const equip = equipmentData[name];
    if (!equip || !equip.scores?.[biome]) continue;

    if (Array.isArray(equip.slots)) {
      const scoreMap = equip.scores[biome];
      if (!scoreMap) continue;

      variableItems.push({
        name,
        options: equip.slots.map(slot => {
          let score = scoreMap[slot.toString()];
          return typeof score === 'number' ? { slot, score } : null;
        }).filter(Boolean)
      });

    } else {
      const slot = equip.slots || 1;
      let score = equip.scores[biome];

      for (let i = 0; i < Math.min(count, 10); i++) {
        fixedItems.push({ name, slot, score, efficiency: score / slot });
      }
    }
  }

  function greedyFill(items, remainingSlots, goldenMultiplier) {
    const sorted = [...items].sort((a, b) => (b.score / b.slot) - (a.score / a.slot));
    let used = 0;
    let score = 0;
    const usage = {};
    for (const item of sorted) {
      if (used + item.slot <= remainingSlots) {
        used += item.slot;
        let itemScore = item.score;
        if (['beetle_egg', 'ant_egg', 'moon', 'wax'].some(keyword => item.name.toLowerCase().includes(keyword))) {
          itemScore *= goldenMultiplier;
        }
        score += itemScore;
        usage[item.name] = (usage[item.name] ?? 0) + 1;
      }
    }
    return { score, usedSlots: used, usedItems: usage };
  }

  let bestResult = { score: 0, usedSlots: 0, usedItems: {} };

  // golden_leaf の使い方パターンを全探索
  for (let gUsed = 0; gUsed <= Math.min(goldenLeafItems.length, 9); gUsed++) {
    const goldenMultiplier = goldenMultipliers[gUsed];

    // golden_leaf を先に slots に詰める
    const goldenUsedItems = goldenLeafItems.slice(0, gUsed);
    const remainingFixedItems = [...fixedItems];

    const usedItems = {};
    goldenUsedItems.forEach(item => {
      usedItems[item.name] = (usedItems[item.name] ?? 0) + 1;
    });

    const usedGoldenSlots = goldenUsedItems.length;
    const greedy = greedyFill(remainingFixedItems, slotLimit - usedGoldenSlots, goldenMultiplier);

    const totalScore = greedy.score;
    const allItems = { ...usedItems, ...greedy.usedItems };

    if (totalScore > bestResult.score) {
      bestResult = {
        score: Math.round(totalScore * 100) / 100,
        usedSlots: usedGoldenSlots + greedy.usedSlots,
        usedItems: allItems
      };
    }
  }

  return bestResult;
}

client.login(TOKEN);

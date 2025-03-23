require("dotenv").config();
const { Bot, InlineKeyboard } = require("grammy");
const { Database } = require("sqlite3");
const { hasEmojis, hasInvalidCharacters } = require("./src/func/checker.js");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const db = new Database("chat_settings.db");

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS chat_settings (chat_id INTEGER PRIMARY KEY, allowed_characters TEXT, allow_emojis INTEGER, allow_invalid_chars INTEGER)");
});

async function getChatSettings(chatId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM chat_settings WHERE chat_id = ?", [chatId], (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                resolve({
                    allowed_characters: row.allowed_characters,
                    allow_emojis: row.allow_emojis === 1,
                    allow_invalid_chars: row.allow_invalid_chars === 1
                });
            } else {
                resolve({
                    allowed_characters: null,
                    allow_emojis: true,
                    allow_invalid_chars: true
                });
            }
        });
    });
}

async function updateChatSettings(chatId, settings) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO chat_settings (chat_id, allowed_characters, allow_emojis, allow_invalid_chars) VALUES (?, ?, ?, ?)`,
            [
                chatId,
                settings.allowed_characters,
                settings.allow_emojis ? 1 : 0,
                settings.allow_invalid_chars ? 1 : 0,
            ],
            (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

bot.command("start", (ctx) => {
    ctx.reply("Привет! Я бот для автоматического принятия заявок в чат! Настроить меня можно в чате командой /settings");
});

bot.command("settings", async (ctx) => {
    if (!ctx.chat) return ctx.reply("Эту команду можно использовать только в чате!");
    const member = await ctx.getChatMember(ctx.from.id);

    if (member.status !== 'administrator' && member.status !== 'creator') {
         return ctx.reply("Эта команда доступна только администраторам чата.");
    }

    let settings = await getChatSettings(ctx.chat.id);

    const inlineKeyboard = new InlineKeyboard()
        .text(settings.allow_emojis ? "Запретить эмодзи в нике" : "Разрешить эмодзи в нике", `toggle_emojis_${ctx.chat.id}`).row()
        .text(settings.allow_invalid_chars ? "Запретить посторонние символы в нике" : "Разрешить посторонние символы в нике", `toggle_chars_${ctx.chat.id}`).row()
        .text("Изменить разрешенные символы в нике", `change_allowed_chars_${ctx.chat.id}`)

    ctx.reply("Настройки бота:", { reply_markup: inlineKeyboard });
});

bot.on("callback_query", async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const action = callbackData.split("_")[0];

    const member = await ctx.getChatMember(ctx.from.id);
     if (member.status !== 'administrator' && member.status !== 'creator') {
         return ctx.answerCallbackQuery({ text: "Эта кнопка доступна только администраторам чата." });
    }

    let settings = await getChatSettings(chatId);

    if (action === "toggle") {
        if (callbackData.startsWith('toggle_emojis')) {
            settings.allow_emojis = !settings.allow_emojis;
            await updateChatSettings(chatId, settings);
            ctx.editMessageReplyMarkup({
                reply_markup: new InlineKeyboard()
                    .text(settings.allow_emojis ? "Запретить эмодзи в нике" : "Разрешить эмодзи в нике", `toggle_emojis_${chatId}`).row()
                    .text(settings.allow_invalid_chars ? "Запретить посторонние символы в нике" : "Разрешить посторонние символы в нике", `toggle_chars_${chatId}`).row()
                    .text("Изменить разрешенные символы в нике", `change_allowed_chars_${chatId}`),
            });
        }

        if (callbackData.startsWith('toggle_chars')) {
            settings.allow_invalid_chars = !settings.allow_invalid_chars;
            await updateChatSettings(chatId, settings);
            ctx.editMessageReplyMarkup({
                reply_markup: new InlineKeyboard()
                    .text(settings.allow_emojis ? "Запретить эмодзи в нике" : "Разрешить эмодзи в нике", `toggle_emojis_${chatId}`).row()
                    .text(settings.allow_invalid_chars ? "Запретить посторонние символы в нике" : "Разрешить посторонние символы в нике", `toggle_chars_${chatId}`).row()
                    .text("Изменить разрешенные символы в нике", `change_allowed_chars_${chatId}`)
            });
        }

    }
    if (action === "change") {
        ctx.session.waitingForAllowedCharacters = true;
        ctx.reply("Введите новые разрешенные символы для ника (без пробелов; пробел может быть в середине списка, если он разрешен):");
    }
    ctx.answerCallbackQuery();
});

bot.on("message", async (ctx) => {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    if (ctx.session && ctx.session.waitingForAllowedCharacters) {
        let settings = await getChatSettings(chatId);
        settings.allowed_characters = text;
        await updateChatSettings(chatId, settings);
        ctx.reply("Разрешенные символы изменены");
        ctx.session.waitingForAllowedCharacters = false;
    }
});
bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith("change_allowed_chars")) {
        ctx.session.waitingForAllowedCharacters = true;
    }
     return next();
})

bot.on("chat_join_request", async (ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.from.first_name+(ctx.from.last_name ? " "+ctx.from.last_name : "");
    const userId = ctx.from.id;
    let settings = await getChatSettings(chatId);

    if (!username) {
        console.log(`User with ID ${userId} without username tried to join chat ${chatId}. Declined.`);
        return await ctx.declineChatJoinRequest(userId);
    }

    if (!settings.allow_emojis && hasEmojis(username)) {
        console.log(`User @${username} (ID: ${userId}) tried to join chat ${chatId} with emojis. Declined.`);
        return await ctx.declineChatJoinRequest(userId);
    }

    if (!settings.allow_invalid_chars && hasInvalidCharacters(username, settings.allowed_characters)) {
        console.log(`User @${username} (ID: ${userId}) tried to join chat ${chatId} with invalid characters. Declined.`);
        return await ctx.declineChatJoinRequest(userId);
    }

    console.log(`User @${username} (ID: ${userId}) was approved to join chat ${chatId}.`);
    await ctx.approveChatJoinRequest(userId);
});

bot.start();
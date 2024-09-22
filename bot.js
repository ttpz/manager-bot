require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let managerId = null;
let channels = [];
const PIN_CODE = process.env.PIN_CODE;
let currentChat = null;

app.get("/", (req, res) => {
	res.send("Telegram bot is running.");
});

app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});

// Обфускация имени пользователя
function obfuscateUsername(username) {
	if (username.length < 3) return username;
	const halfLength = Math.floor(username.length / 2);
	return username.slice(0, halfLength);
}

// Добавление канала с проверкой на дубли
function addChannel(chatName, groupId) {
	const existingChannel = channels.find((ch) => ch.chatName === chatName);
	if (existingChannel) {
		console.log(
			`Канал с названием "${chatName}" уже существует. Старый удален.`
		);
		removeChannel(existingChannel.groupId);
	}
	channels.push({ chatName, groupId, users: [] });
	console.log(`Канал "${chatName}" добавлен с ID группы ${groupId}`);
}

// Удаление канала
function removeChannel(groupId) {
	channels = channels.filter((channel) => channel.groupId !== groupId);
	console.log(`Канал с ID группы ${groupId} удален.`);
}

// Получение текущего канала
function getCurrentChannel(groupId) {
	return channels.find((channel) => channel.groupId === groupId);
}

// Пересылка сообщений менеджеру
function forwardToManager(chatName, content, type, username) {
	const obfuscatedUsername = obfuscateUsername(username);
	if (managerId) {
		switch (type) {
			case "text":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}: ${content}`
				);
				break;
			case "photo":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}:`
				);
				bot.sendPhoto(managerId, content);
				break;
			case "document":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}:`
				);
				bot.sendDocument(managerId, content);
				break;
			case "voice":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}:`
				);
				bot.sendVoice(managerId, content);
				break;
			case "video_note":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}:`
				);
				bot.sendVideoNote(managerId, content);
				break;
			case "video":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}:`
				);
				bot.sendVideo(managerId, content);
				break;
			case "location":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}:`
				);
				bot.sendLocation(
					managerId,
					content.latitude,
					content.longitude
				);
				break;
			case "sticker":
				bot.sendMessage(
					managerId,
					`${chatName} - ${obfuscatedUsername}:`
				);
				bot.sendSticker(managerId, content);
			default:
				console.log("Unsupported content type.");
		}
	} else {
		console.error("Ошибка: ID менеджера не установлен.");
	}
}

// Пересылка сообщений в канал
function forwardToChannel(channelId, content, type) {
	switch (type) {
		case "text":
			bot.sendMessage(channelId, content);
			break;
		case "photo":
			bot.sendPhoto(channelId, content);
			break;
		case "document":
			bot.sendDocument(channelId, content);
			break;
		case "voice":
			bot.sendVoice(channelId, content);
			break;
		case "video_note":
			bot.sendVideoNote(channelId, content);
			break;
		case "video":
			bot.sendVideo(channelId, content);
			break;
		case "location":
			bot.sendLocation(channelId, content.latitude, content.longitude);
			break;
		default:
			console.log("Unsupported content type.");
	}
}

// Кнопки меню
const menuButtons = {
	reply_markup: {
		inline_keyboard: [
			[
				{
					text: "Показать список каналов",
					callback_data: "show_channels",
				},
			],
			[{ text: "Информация о боте", callback_data: "bot_info" }],
			[{ text: "Отправить сообщение", callback_data: "choose_channel" }],
		],
	},
};

// Обработка добавления/удаления бота
bot.on("my_chat_member", (msg) => {
	const groupId = msg.chat.id;
	if (msg.new_chat_member.status === "member") {
		const chatName = msg.chat.title || `Группа ${groupId}`;
		addChannel(chatName, groupId);
		if (managerId) {
			bot.sendMessage(managerId, `Бот добавлен в группу "${chatName}".`);
			bot.sendMessage(
				groupId,
				`Бот подключен. Пожалуйста, предоставьте права администратора.`
			);
		} else {
			console.error("Ошибка: ID менеджера не установлен.");
		}
	} else if (msg.new_chat_member.status === "kicked") {
		removeChannel(groupId);
	}
});
// Обработка входящих сообщений от пользователей
bot.on("message", (msg) => {
	if (msg.chat.type === "group") {
		const groupId = msg.chat.id;
		const channel = getCurrentChannel(groupId); // Fetch the current channel

		// Проверяем, что сообщение отправлено пользователем, а не ботом
		if (channel && !msg.from.is_bot) {
			const username = msg.from.username || msg.from.first_name;

			// Пересылаем сообщение менеджеру через бота
			if (msg.text) {
				forwardToManager(channel.chatName, msg.text, "text", username);
			}

			if (msg.photo) {
				const photo = msg.photo[msg.photo.length - 1].file_id;
				forwardToManager(channel.chatName, photo, "photo", username);
			}

			if (msg.document) {
				forwardToManager(
					channel.chatName,
					msg.document.file_id,
					"document",
					username
				);
			}

			if (msg.voice) {
				forwardToManager(
					channel.chatName,
					msg.voice.file_id,
					"voice",
					username
				);
			}

			if (msg.video) {
				forwardToManager(
					channel.chatName,
					msg.video.file_id,
					"video",
					username
				);
			}

			if (msg.video_note) {
				forwardToManager(
					channel.chatName,
					msg.video_note.file_id,
					"video_note",
					username
				);
			}

			if (msg.location) {
				const { latitude, longitude } = msg.location;
				forwardToManager(
					channel.chatName,
					{ latitude, longitude },
					"location",
					username
				);
			}

			if (msg.sticker) {
				console.log(msg.sticker);
				forwardToManager(
					channel.chatName,
					msg.sticker.file_id,
					"sticker",
					username
				);
			}
		} else {
			console.log(
				"Сообщение не переслано: ID группы не найден в каналах или отправлено ботом."
			);
		}
	}
});
bot.setMyCommands([
	{ command: "/start", description: "Авторизация" },
	{ command: "/menu", description: "Показать меню" },
	{ command: "/message", description: "Отправить сообщение" },
]);
// Команда /start и сохранение ID менеджера
bot.onText(/\/start/, (msg) => {
	if (msg.chat.type === "group") {
		return bot.sendMessage(
			msg.chat.id,
			"Управлять ботом может только менеджер"
		);
	}

	const chatId = msg.chat.id;
	bot.sendMessage(chatId, "Введите PIN код для активации бота:", {
		reply_markup: { force_reply: true },
	});
	bot.once("message", (message) => {
		if (
			message.reply_to_message &&
			message.reply_to_message.text.includes("Введите PIN код")
		) {
			const pin = message.text.trim();
			if (pin === PIN_CODE) {
				managerId = chatId;
				bot.sendMessage(
					managerId,
					"Бот успешно запущен. Ваш ID сохранен как ID менеджера.",
					menuButtons
				);

				console.log(`ID менеджера установлен: ${managerId}`);
			} else {
				bot.sendMessage(
					managerId,
					"Неправильный PIN код. Пожалуйста, попробуйте снова."
				);
				bot.sendMessage(
					managerId,
					"Введите PIN код для активации бота:",
					{ reply_markup: { force_reply: true } }
				);
			}
		}
	});
});

// Команда /menu для открытия меню
bot.onText(/\/menu/, (msg) => {
	if (msg.chat.type === "group") {
		return bot.sendMessage(
			msg.chat.id,
			"Управлять ботом может только менеджер"
		);
	}

	if (!managerId) {
		return bot.sendMessage(
			msg.chat.id,
			"Вход не выполнен, выполните команду /start"
		);
	}
	bot.sendMessage(msg.chat.id, "Меню бота:", menuButtons);
});

bot.onText(/\/message/, (msg) => {
	if (msg.chat.type === "group") {
		return bot.sendMessage(
			msg.chat.id,
			"Управлять ботом может только менеджер"
		);
	}

	if (!managerId) {
		return bot.sendMessage(
			msg.chat.id,
			"Вход не выполнен, выполните команду /start"
		);
	}

	const buttons = channels.map((ch) => [
		{ text: ch.chatName, callback_data: ch.groupId },
	]);
	if (channels.length > 0) {
		bot.sendMessage(msg.chat.id, "Выберите канал для отправки сообщения:", {
			reply_markup: { inline_keyboard: buttons },
		});
	} else {
		bot.sendMessage(
			msg.chat.id,
			"Нет доступных каналов для отправки сообщений.",
			menuButtons
		);
	}
});

// Обработка запросов по нажатию на кнопки
bot.on("callback_query", (callbackQuery) => {
	const action = callbackQuery.data;
	const msg = callbackQuery.message;

	switch (action) {
		case "show_channels":
			const response = `Список каналов:\n${
				channels.length
					? channels
							.map(
								({ chatName, groupId }) =>
									`Канал "${chatName}", ID - ${groupId}`
							)
							.join("\n")
					: "Нет активных каналов"
			}`;
			const removeButtons = channels.map((ch) => [
				{
					text: `Удалить канал "${ch.chatName}"`,
					callback_data: `delete_channel_${ch.groupId}`,
				},
			]);
			bot.sendMessage(msg.chat.id, response, {
				reply_markup: {
					inline_keyboard: removeButtons,
				},
			});
			break;

		case "choose_channel":
			const buttons = channels.map((ch) => [
				{ text: ch.chatName, callback_data: ch.groupId },
			]);
			if (channels.length > 0) {
				bot.sendMessage(
					msg.chat.id,
					"Выберите канал для отправки сообщения:",
					{
						reply_markup: { inline_keyboard: buttons },
					}
				);
			} else {
				bot.sendMessage(
					msg.chat.id,
					"Нет доступных каналов для отправки сообщений.",
					menuButtons
				);
			}
			break;

		case "bot_info":
			bot.sendMessage(
				msg.chat.id,
				`Информация о боте:\nID менеджера: ${
					managerId || "не установлен"
				}`,
				menuButtons
			);
			break;

		default:
			// Проверка, является ли выбранный канал действительным
			const selectedChannel = channels.find(
				(ch) => ch.groupId.toString() === action
			);
			if (selectedChannel) {
				const groupId = parseInt(action);
				if (msg.chat.id !== groupId) {
					bot.sendMessage(
						groupId,
						"Соединение установлено, начинайте общение"
					);
				}

				bot.on("message", (message) => {
					if (!message.from.is_bot) return;

					if (message.text) {
						// Отправка текста
						forwardToChannel(groupId, message.text, "text");
					}

					if (message.photo) {
						// Отправка фотографии
						const photo =
							message.photo[message.photo.length - 1].file_id;
						forwardToChannel(groupId, photo, "photo");
					}

					if (message.document) {
						// Отправка документа
						forwardToChannel(
							groupId,
							message.document.file_id,
							"document"
						);
					}

					if (message.voice) {
						// Отправка голосового сообщения
						forwardToChannel(
							groupId,
							message.voice.file_id,
							"voice"
						);
					}

					if (message.video) {
						// Отправка видео
						forwardToChannel(
							groupId,
							message.video.file_id,
							"video"
						);
					}

					if (message.video_note) {
						// Отправка видео-записки
						forwardToChannel(
							groupId,
							message.video_note.file_id,
							"video_note"
						);
					}

					if (message.location) {
						// Отправка местоположения
						const { latitude, longitude } = message.location;
						forwardToChannel(
							groupId,
							{ latitude, longitude },
							"location"
						);
					}

					if (message.sticker) {
						bot.sendSticker(groupId, message.sticker.file_id);
					}

					const channel = getCurrentChannel(groupId);
					bot.sendMessage(
						message.chat.id,
						`${channel.chatName} - Вы: ${
							message.text ?? "Отправили сообщение"
						}`
					);
				});
			} else {
				// bot.sendMessage(msg.chat.id, "Неверный выбор.", menuButtons);
			}
			break;
	}

	if (action.startsWith("delete_channel_")) {
		const groupId = parseInt(action.split("_")[2], 10);
		removeChannel(groupId);
		bot.sendMessage(msg.chat.id, `Канал удалён.`);
	}
});

bot.on("polling_error", (error) => {
	console.error("Polling error:", error);
});

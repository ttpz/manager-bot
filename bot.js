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
let currentChannel = null;

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
	return username.slice(0, halfLength) + username.at(-1);
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
	return channels.find((channel) => channel.groupId == groupId);
}

// Пересылка сообщений менеджеру
function forwardToManager(chatName, content, type, username) {
	const obfuscatedUsername = obfuscateUsername(username);
	// Функция для замены упоминаний вида @username на @****
	const blurMentions = (text) => text.replace(/@\w+/g, "@****");

	// Обрабатываем текстовые сообщения, чтобы скрыть упоминания
	if (type === "text") {
		content = blurMentions(content);
	}

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
	if (type === "text" && content.startsWith("/")) return;

	// Функция для замены упоминаний вида @username на @****
	const blurMentions = (text) => text.replace(/@\w+/g, "@****");

	// Обрабатываем текстовые сообщения, чтобы скрыть упоминания
	if (type === "text") {
		content = blurMentions(content);
	}

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
		case "sticker":
			bot.sendSticker(channelId, content);
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

// Основной обработчик всех сообщений
bot.on("message", (message) => {
	const chatName = message.chat.title || message.chat.username || "Unknown";
	const username = message.from.first_name || "User";

	// 1. Сообщения из группы (если chat.type === "group") пересылаем менеджеру
	if (message.chat.type === "group") {
		// Проверяем, что сообщение пришло из группы, а не от бота
		if (!message.from.is_bot) {
			if (message.text) {
				if (PIN_CODE === message.text) return;

				forwardToManager(chatName, message.text, "text", username);
			}

			if (message.photo) {
				const photo = message.photo[message.photo.length - 1].file_id;
				forwardToManager(chatName, photo, "photo", username);
			}

			if (message.voice) {
				forwardToManager(
					chatName,
					message.voice.file_id,
					"voice",
					username
				);
			}

			if (message.video) {
				forwardToManager(
					chatName,
					message.video.file_id,
					"video",
					username
				);
			}

			if (message.document) {
				forwardToManager(
					chatName,
					message.document.file_id,
					"document",
					username
				);
			}

			if (message.location) {
				const { latitude, longitude } = message.location;
				forwardToManager(
					chatName,
					{ latitude, longitude },
					"location",
					username
				);
			}

			if (message.sticker) {
				forwardToManager(
					chatName,
					message.sticker.file_id,
					"sticker",
					username
				);
			}
		}
		return; // Остановить дальнейшую обработку, если сообщение из группы
	}

	// 2. Сообщения от менеджера в текущий выбранный канал
	if (currentChannel && message.chat.type === "private") {
		if (message.text) {
			if (PIN_CODE === message.text) return;

			forwardToChannel(currentChannel.groupId, message.text, "text");
		}

		if (message.photo) {
			const photo = message.photo[message.photo.length - 1].file_id;
			forwardToChannel(currentChannel.groupId, photo, "photo");
		}

		if (message.voice) {
			forwardToChannel(
				currentChannel.groupId,
				message.voice.file_id,
				"voice"
			);
		}

		if (message.video) {
			forwardToChannel(
				currentChannel.groupId,
				message.video.file_id,
				"video"
			);
		}

		if (message.document) {
			forwardToChannel(
				currentChannel.groupId,
				message.document.file_id,
				"document"
			);
		}

		if (message.video_note) {
			forwardToChannel(
				currentChannel.groupId,
				message.video_note.file_id,
				"video_note"
			);
		}

		if (message.location) {
			const { latitude, longitude } = message.location;
			forwardToChannel(
				currentChannel.groupId,
				{ latitude, longitude },
				"location"
			);
		}

		if (message.sticker) {
			forwardToChannel(
				currentChannel.groupId,
				message.sticker.file_id,
				"sticker"
			);
		}

		bot.sendMessage(
			message.chat.id,
			`Сообщение отправлено в канал ${currentChannel.chatName}`
		).then((sentMessage) => {
			// Удалить сообщение через 0.5 секунд
			setTimeout(() => {
				bot.deleteMessage(message.chat.id, sentMessage.message_id);
			}, 500); // 500 миллисекунд = 0.5 секунды
		});
	}
});

bot.setMyCommands([
	{ command: "/start", description: "Авторизация" },
	{ command: "/menu", description: "Показать меню" },
	{ command: "/message", description: "Отправить сообщение" },
]);

// Команда /start и сохранение ID менеджера
bot.onText(/\/start/, (msg) => {
	if (msg.chat.type === "group")
		return bot.sendMessage(
			msg.chat.id,
			"Ботом может управлять только менедежер"
		);

	const chatId = msg.chat.id;
	bot.sendMessage(chatId, "Введите PIN код для активации бота:");

	// Слушаем следующее сообщение для проверки PIN кода
	bot.once("message", (message) => {
		// Убеждаемся, что сообщение от того же пользователя
		if (message.chat.id === chatId) {
			const pin = message.text.trim(); // Ввод пользователя

			// Проверяем PIN код
			if (pin === PIN_CODE) {
				managerId = chatId; // Сохраняем ID менеджера
				bot.sendMessage(
					chatId,
					"Бот успешно запущен. Ваш ID сохранен как ID менеджера.",
					menuButtons
				);
				console.log(`ID менеджера установлен: ${managerId}`);
			} else {
				// Отправляем ошибку при неправильном вводе
				bot.sendMessage(
					chatId,
					"Неправильный PIN код. Пожалуйста, попробуйте снова."
				);

				// Запрашиваем ввод PIN кода снова
				bot.sendMessage(chatId, "Введите PIN код для активации бота:");

				// Повторно слушаем сообщение для нового PIN кода
				bot.once("message", (newMessage) => {
					if (newMessage.chat.id === chatId) {
						const newPin = newMessage.text.trim();
						if (newPin === PIN_CODE) {
							managerId = chatId;
							bot.sendMessage(
								chatId,
								"Бот успешно запущен. Ваш ID сохранен как ID менеджера.",
								menuButtons
							);
							console.log(
								`ID менеджера установлен: ${managerId}`
							);
						} else {
							bot.sendMessage(
								chatId,
								"Неправильный PIN код. Пожалуйста, попробуйте снова."
							);
						}
					}
				});
			}
		}
	});
});

// Команда /menu для открытия меню
bot.onText(/\/menu/, (msg) => {
	if (msg.chat.type === "group")
		return bot.sendMessage(
			msg.chat.id,
			"Ботом может управлять только менедежер"
		);
	if (!managerId) {
		return bot.sendMessage(
			msg.chat.id,
			"Вход не выполнен, выполните команду /start"
		);
	}
	bot.sendMessage(msg.chat.id, "Меню бота:", menuButtons);
});

bot.onText(/\/message/, (msg) => {
	if (msg.chat.type === "group")
		return bot.sendMessage(
			msg.chat.id,
			"Ботом может управлять только менедежер"
		);

	if (!managerId) {
		return bot.sendMessage(
			msg.chat.id,
			"Вход не выполнен, выполните команду /start"
		);
	}
	if (!channels.length) {
		return bot.sendMessage(managerId, "Список каналов пуст");
	}
	const channelButtons = channels.map((channel) => [
		{
			text: channel.chatName, // Отображаемое имя канала
			callback_data: `change_current_channel:${channel.groupId}`, // Уникальный ID канала
		},
	]);

	bot.sendMessage(msg.chat.id, "Выберите канал для отправки сообщений:", {
		reply_markup: {
			inline_keyboard: channelButtons,
		},
	});
});

bot.on("callback_query", (callbackQuery) => {
	const action = callbackQuery.data;
	const msg = callbackQuery.message;
	const chatId = callbackQuery.message.chat.id;

	// Проверка типа действия change_current_channel
	if (action.startsWith("change_current_channel")) {
		console.log(action);
		const channelId = action.split(":")[1]; // Извлекаем ID канала
		currentChannel = getCurrentChannel(channelId); // Предполагаем, что getCurrentChannel(channelId) возвращает объект канала по ID
		console.log(currentChannel);
		// Сообщаем менеджеру, что канал был успешно выбран
		bot.sendMessage(
			chatId,
			`Канал ${currentChannel.chatName} выбран для отправки сообщений.`
		);
	}

	if (action.startsWith("choose_channel")) {
		bot.sendMessage(chatId, "/message");
	}

	// Обработка других команд в callback_query
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

		case "bot_info":
			bot.sendMessage(
				msg.chat.id,
				`Информация о боте:\nID менеджера: ${
					managerId || "не установлен"
				}`
			);
			break;

		default:
			// Убираем часть, которая касается выбора канала для отправки сообщений
			if (action.startsWith("delete_channel_")) {
				const groupId = parseInt(action.split("_")[2], 10);
				removeChannel(groupId);
				bot.sendMessage(msg.chat.id, `Канал удалён.`);
			}
			break;
	}
});

bot.on("polling_error", (error) => {
	console.error("Polling error:", error);
});

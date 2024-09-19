require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
	res.send("Telegram bot is running.");
});

app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let managerId = null; // Переменная для хранения ID менеджера

// Объект для хранения каналов и групп
let channels = []; // Пример структуры: { chatName: "Chat Title", groupId: -4591803123, users: [] }

// Добавление канала
function addChannel(chatName, groupId) {
	channels.push({ chatName, groupId, users: [] });
	console.log(`Канал "${chatName}" добавлен с группой ${groupId}`);
}

// Удаление канала
function removeChannel(groupId) {
	channels = channels.filter((channel) => channel.groupId !== groupId);
	console.log(`Канал с группой ${groupId} удален.`);
}

// Получить текущий канал
function getCurrentChannel(groupId) {
	return channels.find((channel) => channel.groupId === groupId);
}

// Обфускация никнейма
function obfuscateUsername(username) {
	if (username.length < 3) return username; // Не обрезаем короткие имена
	const halfLength = Math.floor(username.length / 2);
	return (
		username.slice(0, halfLength) + "*".repeat(username.length - halfLength)
	);
}

// Пересылка сообщения менеджеру
function forwardToManager(chatName, messageText, username) {
	const obfuscatedUsername = obfuscateUsername(username);
	if (managerId) {
		bot.sendMessage(
			managerId,
			`${chatName} - ${obfuscatedUsername}: ${messageText}`
		);
	} else {
		console.error("Ошибка: ID менеджера не установлен.");
	}
}

// Кнопки с действиями
const mainMenu = {
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

// Когда бот добавляется в группу или исключается
bot.on("my_chat_member", (msg) => {
	const groupId = msg.chat.id;
	if (msg.new_chat_member.status === "member") {
		const chatName = msg.chat.title || `Group ${groupId}`; // Используем название чата

		// Сохраняем канал
		addChannel(chatName, groupId);

		if (managerId) {
			// Уведомление менеджера (без логирования ID)
			bot.sendMessage(
				managerId,
				`Бот был добавлен в группу "${chatName}".`
			);

			// Уведомление группы
			bot.sendMessage(
				groupId,
				`Бот подключен. Пожалуйста, предоставьте права администратора для просмотра сообщений участников.`
			);
		} else {
			console.error("Ошибка: ID менеджера не установлен.");
		}
	} else if (msg.new_chat_member.status === "kicked") {
		// Если бот был исключен, удаляем канал
		removeChannel(groupId);
		console.log(`Бот был исключен из группы ${groupId}. Канал удален.`);
	}
});

// Обработка текстовых сообщений и медиа-контента
bot.on("message", (msg) => {
	if (
		msg.new_chat_member ||
		msg.left_chat_member ||
		msg.new_chat_title ||
		msg.new_chat_photo
	) {
		return; // Пропускаем системные сообщения
	}

	if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
		const groupId = msg.chat.id;
		const channel = getCurrentChannel(groupId);

		if (channel) {
			const username = msg.from.username || msg.from.first_name;

			// Если сообщение содержит текст
			if (msg.text) {
				forwardToManager(channel.chatName, msg.text, username);
			}

			// Если сообщение содержит фото
			if (msg.photo) {
				const photoId = msg.photo[msg.photo.length - 1].file_id;
				bot.getFileLink(photoId).then((link) => {
					forwardToManager(
						channel.chatName,
						`Фото: ${link}`,
						username
					);
				});
			}

			// Если сообщение содержит документ
			if (msg.document) {
				const documentId = msg.document.file_id;
				bot.getFileLink(documentId).then((link) => {
					forwardToManager(
						channel.chatName,
						`Документ: ${link}`,
						username
					);
				});
			}

			// Если сообщение содержит голосовое сообщение
			if (msg.voice) {
				const voiceId = msg.voice.file_id;
				bot.getFileLink(voiceId).then((link) => {
					forwardToManager(
						channel.chatName,
						`Голосовое сообщение: ${link}`,
						username
					);
				});
			}

			// Если сообщение содержит видеосообщение (кружок)
			if (msg.video_note) {
				const videoNoteId = msg.video_note.file_id;
				bot.getFileLink(videoNoteId).then((link) => {
					forwardToManager(
						channel.chatName,
						`Видеосообщение: ${link}`,
						username
					);
				});
			}
		} else {
			console.log(
				"Сообщение не было отправлено: ID группы не найден в каналах."
			);
		}
	}
});

// Команда для запуска бота и сохранения ID менеджера
bot.onText(/\/start/, (msg) => {
	managerId = msg.chat.id;
	bot.sendMessage(
		managerId,
		"Бот успешно запущен. Ваш ID сохранён как ID менеджера.",
		mainMenu
	);
	console.log(`Менеджер ID установлен: ${managerId}`);
});

// Обработка команд через кнопки
bot.on("callback_query", (callbackQuery) => {
	const action = callbackQuery.data;
	const msg = callbackQuery.message;

	if (action === "show_channels") {
		if (channels.length === 0) {
			bot.sendMessage(msg.chat.id, "Нет активных каналов.");
			return;
		}

		let response = `Список каналов:\n${
			channels.length
				? channels.map(
						({ chatName, groupId }) =>
							`Канал "${chatName}", ID - ${groupId} \n`
				  )
				: "Пусто"
		}`;
		const buttons = channels.map((ch) => [
			{
				text: `Удалить канал "${ch.chatName}"`,
				callback_data: `delete_channel_${ch.groupId}`,
			},
		]);

		bot.sendMessage(msg.chat.id, response, {
			reply_markup: {
				inline_keyboard: buttons,
			},
		});
	}

	if (action === "bot_info") {
		const info = managerId
			? `ID менеджера: ${managerId}`
			: "ID менеджера не установлен. Пожалуйста, подключите менеджера через команду /start.";
		bot.sendMessage(msg.chat.id, info);
	}

	// Отправка сообщения через кнопки
	if (action === "choose_channel") {
		const buttons = channels.map((ch) => [
			{
				text: `Отправить в "${ch.chatName}"`,
				callback_data: `send_channel_${ch.groupId}`,
			},
		]);

		bot.sendMessage(msg.chat.id, "Выберите канал для отправки сообщения:", {
			reply_markup: {
				inline_keyboard: buttons,
			},
		});
	}

	// Когда выбран канал для отправки сообщения
	if (action.startsWith("send_channel_")) {
		const groupId = parseInt(action.split("_")[2], 10);
		const channel = getCurrentChannel(groupId);

		if (channel) {
			bot.sendMessage(
				msg.chat.id,
				`Выбрали канал "${channel.chatName}". Напишите сообщение для отправки.`
			);

			// Ожидаем сообщение для отправки в выбранный канал
			bot.once("message", (message) => {
				if (message.text) {
					bot.sendMessage(groupId, message.text);
					bot.sendMessage(msg.chat.id, "Сообщение отправлено.");
				}

				// Если сообщение содержит медиа-контент
				if (message.photo) {
					const photoId =
						message.photo[message.photo.length - 1].file_id;
					bot.sendPhoto(groupId, photoId);
					bot.sendMessage(msg.chat.id, "Фото отправлено.");
				}

				if (message.voice) {
					const voiceId = message.voice.file_id;
					bot.sendVoice(groupId, voiceId);
					bot.sendMessage(
						msg.chat.id,
						"Голосовое сообщение отправлено."
					);
				}

				if (message.video_note) {
					const videoNoteId = message.video_note.file_id;
					bot.sendVideoNote(groupId, videoNoteId);
					bot.sendMessage(msg.chat.id, "Видеосообщение отправлено.");
				}
			});
		}
	}

	// Удаление канала
	if (action.startsWith("delete_channel_")) {
		const groupId = parseInt(action.split("_")[2], 10);
		removeChannel(groupId);
		bot.sendMessage(msg.chat.id, `Канал удалён.`);
	}
});

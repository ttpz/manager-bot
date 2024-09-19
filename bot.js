require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

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
			`Сообщение из чата "${chatName}" от пользователя ${obfuscatedUsername}: ${messageText}`
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
			[{ text: "Отправить сообщение", callback_data: "send_message" }],
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
			// Уведомление менеджера
			bot.sendMessage(
				managerId,
				`Бот был добавлен в группу с ID ${groupId}. Канал "${chatName}" подключен.`
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

// Обработка сообщений от участников групп
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
			// Пересылаем сообщение менеджеру
			const username = msg.from.username || msg.from.first_name;
			forwardToManager(
				channel.chatName,
				msg.text ?? "Неизвестный символ",
				username
			);
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

	if (action === "send_message") {
		if (!managerId) {
			bot.sendMessage(
				msg.chat.id,
				"ID менеджера не установлен. Пожалуйста, используйте команду /start для настройки."
			);
		} else {
			bot.sendMessage(
				msg.chat.id,
				"Пожалуйста, отправьте команду в формате:\n/send <канал название> <сообщение>"
			);
		}
	}

	// Удаление канала при нажатии на кнопку
	if (action.startsWith("delete_channel_")) {
		const groupId = parseInt(action.split("_")[2], 10);
		const channel = getCurrentChannel(groupId);

		if (channel) {
			bot.leaveChat(groupId); // Бот покидает группу
			removeChannel(groupId); // Удаляем канал из списка
			bot.sendMessage(
				msg.chat.id,
				`Канал "${channel.chatName}" был удалён и бот покинул группу.`
			);
		} else {
			bot.sendMessage(msg.chat.id, `Канал с ID ${groupId} не найден.`);
		}
	}
});

// Обработка сообщений от менеджера (отправка в группу через кнопки)
bot.onText(/\/send (.+) (.+)/, (msg, match) => {
	const chatName = match[1];
	const message = match[2];
	const channel = channels.find((ch) => ch.chatName == chatName);
	if (channel) {
		bot.sendMessage(channel.groupId, message);
	} else {
		bot.sendMessage(msg.chat.id, `Канал "${chatName}" не существует.`);
	}
});

console.log("Бот запущен");

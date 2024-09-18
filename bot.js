require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let managerId = null; // Переменная для хранения ID менеджера

// Объект для хранения каналов и групп
let channels = []; // Пример структуры: { channelId: 1, groupId: -4591803123, users: [] }

// Добавление канала
function addChannel(channelId, groupId) {
	channels.push({ channelId, groupId, users: [] });
	console.log(`Канал ${channelId} добавлен с группой ${groupId}`);
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

// Пересылка сообщения менеджеру
function forwardToManager(channelId, messageText) {
	if (managerId) {
		bot.sendMessage(
			managerId,
			`Сообщение из канала ${channelId}: ${messageText}`
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
		const channelId = channels.length ? channels.length + 1 : 1; // Присвоение нового номера канала

		// Сохраняем канал
		addChannel(channelId, groupId);

		if (managerId) {
			// Уведомление менеджера
			bot.sendMessage(
				managerId,
				`Бот был добавлен в группу с ID ${groupId}. Канал ${channelId} подключен.`
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
			forwardToManager(
				channel.channelId,
				msg.text ?? "Неизвестный символ"
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
						({ channelId, groupId }) =>
							`Канал ${channelId}, ID - ${groupId} \n`
				  )
				: "Пусто"
		}`;
		const buttons = channels.map((ch) => [
			{
				text: `Удалить канал ${ch.channelId}`,
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
				"Пожалуйста, отправьте команду в формате:\n/send <канал ID> <сообщение>"
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
				`Канал с ID ${channel.channelId} был удалён и бот покинул группу.`
			);
		} else {
			bot.sendMessage(msg.chat.id, `Канал с ID ${groupId} не найден.`);
		}
	}
});

// Обработка сообщений от менеджера (отправка в группу через кнопки)
bot.onText(/\/send (\d+) (.+)/, (msg, match) => {
	const channelId = match[1];
	const message = match[2];
	const channel = channels.find((ch) => ch.channelId == channelId);
	if (channel) {
		bot.sendMessage(channel.groupId, message);
	} else {
		bot.sendMessage(msg.chat.id, `Канал ${channelId} не существует.`);
	}
});

console.log("Бот запущен");

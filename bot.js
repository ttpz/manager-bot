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

// Когда бот добавляется в группу
bot.on("my_chat_member", (msg) => {
	if (msg.new_chat_member.status === "member") {
		const groupId = msg.chat.id;
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
				`Бот подключен. Теперь вы можете общаться через него.`
			);
		} else {
			console.error("Ошибка: ID менеджера не установлен.");
		}
	}
});

// Обработка сообщений от участников групп
bot.on("message", (msg) => {
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
		"Бот успешно запущен. Ваш ID сохранён как ID менеджера."
	);
	console.log(`Менеджер ID установлен: ${managerId}`);
});

// Обработка сообщений от менеджера (отправка в группу)
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

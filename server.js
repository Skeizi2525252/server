const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const config = require('./cfg');
const cors = require('cors');
const path = require('path');

const app = express();

// Инициализация Supabase
const supabase = createClient(config.supabase.url, config.supabase.key);

// Middleware
app.use(bodyParser.json());

// Включаем CORS
app.use(cors());

// Раздача статических файлов
app.use(express.static(path.join(__dirname)));

// Валидация подписи вебхука
function validateWebhook(req) {
    const signature = req.headers['x-crypto-bot-signature'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', config.cryptoBot.webhookSecret);
    const calculatedSignature = hmac.update(JSON.stringify(req.body)).digest('hex');
    
    return signature === calculatedSignature;
}

// Создание счета в крипто боте
async function createInvoice(amount, userId) {
    try {
        const response = await axios.post(`${config.cryptoBot.apiUrl}/createInvoice`, {
            amount: amount,
            currency: 'RUB',
            description: `Пополнение баланса для пользователя ${userId}`,
            paid_btn_name: 'callback',
            paid_btn_url: `https://your-domain.com/success?userId=${userId}`,
            allow_comments: false,
            allow_anonymous: false
        }, {
            headers: {
                'Crypto-Pay-API-Token': config.cryptoBot.token
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error creating invoice:', error);
        throw error;
    }
}

// Обработка вебхуков от крипто бота
app.post('/webhook/crypto-bot', async (req, res) => {
    if (!validateWebhook(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const { invoice_id, status, amount } = req.body;

    try {
        if (status === 'paid') {
            const { data, error } = await supabase
                .from('users')
                .update({ balance: supabase.raw(`balance + ${amount}`) })
                .eq('invoice_id', invoice_id);

            if (error) throw error;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Создание счета
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { amount, userId } = req.body;
        
        // Используем функцию createInvoice для создания счета
        const invoiceData = await createInvoice(amount, userId);
        
        // Создаем запись в базе данных
        const { data, error } = await supabase
            .from('transactions')
            .insert([
                {
                    user_id: userId,
                    amount: amount,
                    type: 'deposit',
                    status: 'pending',
                    invoice_id: invoiceData.invoice_id
                }
            ])
            .select();
            
        if (error) throw error;
        
        res.json({
            status: 'ok',
            result: {
                pay_url: invoiceData.pay_url,
                invoice_id: invoiceData.invoice_id
            }
        });
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// Проверка состояния сервера
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Запуск сервера
app.post('/api/start-server', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Обработка успешной оплаты
app.post('/api/payment-success', async (req, res) => {
    try {
        const { invoice_id, user_id, amount } = req.body;
        
        // Здесь будет логика обновления статуса транзакции
        res.json({
            status: 'ok',
            message: 'Payment processed successfully'
        });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ error: 'Failed to process payment' });
    }
});

// Функция для запуска сервера
function startServer() {
    const server = app.listen(config.server.port, config.server.host, () => {
        console.log(`Server running at http://${config.server.host}:${config.server.port}`);
    });

    // Обработка ошибок сервера
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.log(`Port ${config.server.port} is busy, trying ${config.server.port + 1}`);
            config.server.port++;
            startServer();
        } else {
            console.error('Server error:', error);
        }
    });
}

// Автозапуск сервера
startServer();

// Экспортируем для использования в других файлах
module.exports = { app, startServer };
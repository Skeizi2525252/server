const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3000; // Фиксированный порт

// Middleware
app.use(cors());
app.use(express.json());

// Supabase configuration
const supabaseUrl = 'https://xoghofrmuxiqufwnikys.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvZ2hvZnJtdXhpcXVmd25pa3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5MDQyMDAsImV4cCI6MjA2NDQ4MDIwMH0.5uGZYxhlWhuCCEKNV_WBz9gC9ygqCCh69pSde2KtAJM';
const supabase = createClient(supabaseUrl, supabaseKey);

// Create invoice endpoint
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { amount, currency, user_id } = req.body;

        // Validate input
        if (!amount || !currency || !user_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create transaction record
        const { data: transaction, error } = await supabase
            .from('transactions')
            .insert([
                {
                    user_id: user_id,
                    amount: amount,
                    type: 'deposit',
                    status: 'pending',
                    currency: currency
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // Generate payment URL
        const paymentUrl = `https://t.me/RolseNotbot?start=pay_${transaction.id}`;

        res.json({
            success: true,
            payment_url: paymentUrl,
            transaction_id: transaction.id
        });

    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// Update balance endpoint
app.post('/api/user/deposit', async (req, res) => {
    try {
        const { amount, user_id } = req.body;

        // Validate input
        if (!amount || !user_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Update user balance
        const { data: user, error } = await supabase
            .from('users')
            .update({ 
                balance: supabase.raw(`balance + ${amount}`),
                deposit: supabase.raw(`deposit + ${amount}`)
            })
            .eq('telegram_id', user_id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            balance: user.balance
        });

    } catch (error) {
        console.error('Error updating balance:', error);
        res.status(500).json({ error: 'Failed to update balance' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

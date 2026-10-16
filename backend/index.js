require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const supabase = require('./config/supabase');

const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const lineRoutes = require('./routes/lineRoutes');
const ocrRoutes = require('./routes/ocrRoutes');
const lineWebhookRoutes = require('./routes/lineWebhookRoutes');
const recurringRoutes = require('./routes/recurringRoutes');
const accountRoutes = require('./routes/accountRoutes');
const billRoutes = require('./routes/billRoutes');
const portfolioRoutes = require('./routes/portfolioRoutes');
const budgetEventRoutes = require('./routes/budgetEventRoutes');
const googleRoutes = require('./routes/googleRoutes');
const { startDailyDigestJob } = require('./jobs/dailyDigest');
const { startRecurringTransactionsJob } = require('./jobs/recurringTransactions');
const { startActivityReminderJob } = require('./jobs/activityReminders');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Mounted before express.json(): the LINE webhook middleware verifies the request
// signature against the raw body itself and would break if the body were already
// parsed by the time it runs.
app.use('/api/line', lineWebhookRoutes);

// Default express.json() limit is 100kb -- a base64-encoded receipt photo (even
// resized client-side to ~1280px JPEG) comfortably exceeds that, causing a 413
// that's easy to miss in testing with a tiny synthetic image.
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ message: 'Expense Tracker API is running' });
});

app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    
    if (error) {
      return res.status(500).json({ status: 'error', message: 'Database connection failed', error: error.message });
    }
    
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Health check failed', error: err.message });
  }
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/line', lineRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/budget-events', budgetEventRoutes);
app.use('/api/google', googleRoutes);

// LIFF (LINE MINI App) -- static files, plus a tiny dynamic script so the LIFF ID
// lives in .env like every other credential rather than being hardcoded into a
// committed static file.
app.get('/liff-config.js', (req, res) => {
  res.type('application/javascript').send(`window.LIFF_ID = ${JSON.stringify(process.env.LIFF_ID || '')};`);
});
app.use('/liff', express.static(path.join(__dirname, '../liff-app')));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startDailyDigestJob();
  startRecurringTransactionsJob();
  startActivityReminderJob();
});

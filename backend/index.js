require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./config/supabase');

const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const lineRoutes = require('./routes/lineRoutes');
const ocrRoutes = require('./routes/ocrRoutes');
const lineWebhookRoutes = require('./routes/lineWebhookRoutes');
const { startDailyDigestJob } = require('./jobs/dailyDigest');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Mounted before express.json(): the LINE webhook middleware verifies the request
// signature against the raw body itself and would break if the body were already
// parsed by the time it runs.
app.use('/api/line', lineWebhookRoutes);

app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startDailyDigestJob();
});

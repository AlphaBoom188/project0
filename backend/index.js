require('dotenv').config();

// ---- Startup checks: fail fast with a clear message, not on first use ----
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LINE_MESSAGING_CHANNEL_SECRET', 'LINE_MESSAGING_CHANNEL_ACCESS_TOKEN', 'OPENAI_API_KEY', 'LIFF_ID'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`[startup] Missing required settings in backend/.env: ${missingEnv.join(', ')}. See backend/.env.example.`);
  process.exit(1);
}
const IS_TEST_INSTANCE = process.env.DISABLE_CRON === '1';
if (!IS_TEST_INSTANCE && !process.env.OWNER_LINE_USER_ID) {
  console.warn('[startup] OWNER_LINE_USER_ID is not set: the ops agent can record errors but cannot alert you on LINE.');
}

// Error capture starts before anything else can log (services/opsAgent.js).
// Test instances skip it: their deliberate failures shouldn't reach the
// production error log or your LINE.
const opsAgent = require('./services/opsAgent');
if (!IS_TEST_INSTANCE && process.env.OPS_AGENT !== 'off') opsAgent.install();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
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
const statementRoutes = require('./routes/statementRoutes');
const groupRoutes = require('./routes/groupRoutes');
const voiceRoutes = require('./routes/voiceRoutes');
const googleRoutes = require('./routes/googleRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const noteRoutes = require('./routes/noteRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const taxRoutes = require('./routes/taxRoutes');
const { startDailyDigestJob } = require('./jobs/dailyDigest');
const { startRecurringTransactionsJob } = require('./jobs/recurringTransactions');
const { startActivityReminderJob } = require('./jobs/activityReminders');
const { startPayWindowReminderJob } = require('./jobs/payWindowReminders');
const { startGroupBillReminderJob } = require('./jobs/groupBillReminders');
const { startReminderDispatchJob } = require('./jobs/reminderDispatch');
const { startTaxRulesCheckJob } = require('./jobs/taxRulesCheck');
const { startMorningBriefingJob } = require('./jobs/morningBriefing');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers. The LIFF app, the public bill page and the API share this
// origin, so cross-origin access is off unless CORS_ORIGINS lists origins
// (comma-separated); the iOS app isn't a browser and doesn't need CORS.
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  });
  next();
});
const corsOrigins = String(process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
if (corsOrigins.length) app.use(cors({ origin: corsOrigins }));

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
app.use('/api/statements', statementRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/tax', taxRoutes);

// LIFF (LINE MINI App) -- static files, plus a tiny dynamic script so the LIFF ID
// lives in .env like every other credential rather than being hardcoded into a
// committed static file.
app.get('/liff-config.js', (req, res) => {
  res.type('application/javascript').send(`window.LIFF_ID = ${JSON.stringify(process.env.LIFF_ID || '')};`);
});
app.use('/liff', express.static(path.join(__dirname, '../liff-app')));

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // DISABLE_CRON=1 is for extra instances (e.g. a test server on another port).
  // Each job slot also runs at most once across processes (job_runs, opsAgent.runOnce).
  if (IS_TEST_INSTANCE) {
    console.log('[cron] DISABLE_CRON=1 -- scheduled jobs NOT started on this instance');
    return;
  }
  startDailyDigestJob();
  startRecurringTransactionsJob();
  startActivityReminderJob();
  startPayWindowReminderJob();
  startGroupBillReminderJob();
  startReminderDispatchJob();
  startTaxRulesCheckJob();
  startMorningBriefingJob();
  if (process.env.OPS_AGENT !== 'off') {
    // Watchdog: every 5 minutes, one run per slot.
    cron.schedule('*/5 * * * *', () => {
      const slot = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString().slice(0, 16);
      opsAgent.runOnce('watchdog', slot, async () => JSON.stringify(await opsAgent.tick()));
    });
    console.log('[ops] watchdog scheduled every 5 minutes');
  }
});

// Graceful shutdown (launchd/hosting send SIGTERM; Ctrl+C sends SIGINT):
// stop scheduling jobs, finish in-flight requests, record buffered errors.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal}: finishing in-flight requests...`);
  for (const task of cron.getTasks().values()) task.stop();
  server.close(() => opsAgent.flush().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

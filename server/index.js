const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api/agents', require('./routes/agents'));
app.use('/api/verticals', require('./routes/verticals'));
app.use('/api/cohorts', require('./routes/cohorts'));
app.use('/api/overview', require('./routes/overview'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/simulation', require('./routes/simulation'));
app.use('/api/prompts', require('./routes/prompts'));
app.use('/api/labelling', require('./routes/labelling'));
app.use('/api/playground', require('./routes/playground'));
app.use('/api/golden-set', require('./routes/goldenSet'));
app.use('/api/sari-misshipment', require('./routes/sariMisshipment'));
app.use('/api/h3-test', require('./routes/h3Test'));
app.use('/api/h2', require('./routes/h2'));
app.use('/api/h6', require('./routes/h6'));
app.use('/api/h4', require('./routes/h4'));
app.use('/api/token-analysis', require('./routes/tokenAnalysis'));

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FRM Dashboard API running on http://localhost:${PORT}`);
});

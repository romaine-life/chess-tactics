const path = require('path');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, '..', 'frontend');

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.use(express.static(frontendDir));

app.use((_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`chimera-board listening on :${port}`);
});

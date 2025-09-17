// app.js
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3001;

// Parse Inbound requests in JSON
app.use(express.json());

// API route example 1
app.get('/hello', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

// API route example 2
app.post('/extract', async (req, res) => {
  const userInput = req.body.description;
  const prompt = `Extract App Name, Entities, Roles, Features from: "${userInput}"`;

//   const response = await axios.post('https://api.openrouter.ai/v1/chat/completions', {
//     model: 'mistral',
//     messages: [{ role: 'user', content: prompt }],
//   }, {
//     headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
//   });
//
//   res.json(response.data);

    res.json(prompt);
});

// Simpler Port Listen
app.listen(PORT, () => console.log(`App listening on port ${PORT}!`))

// Alternative Port Listen - Update keepAlive settings for server to avoid TCP race condition.
// const server = app.listen(PORT, () => console.log(`App listening on port ${PORT}!`));
// server.keepAliveTimeout = 120 * 1000;
// server.headersTimeout = 120 * 1000;
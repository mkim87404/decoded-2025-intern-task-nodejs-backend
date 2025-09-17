// server.js
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.post('/extract', async (req, res) => {
  const userInput = req.body.description;
  const prompt = `Extract App Name, Entities, Roles, Features from: "${userInput}"`;

//   const response = await axios.post('https://api.openrouter.ai/v1/chat/completions', {
//     model: 'mistral',
//     messages: [{ role: 'user', content: prompt }],
//   }, {
//     headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
//   });

//   res.json(response.data);

    res.json(prompt);
});

app.listen(process.env.PORT || 3000);
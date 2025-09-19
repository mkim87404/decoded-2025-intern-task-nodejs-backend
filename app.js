// Conditionally Load Environment Variables (Don't need dotenv package on Render Production)
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  require('dotenv').config();
}
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// Allow Only the Frontend Domain for CORS
app.use(cors({ origin: 'https://decoded-2025-intern-task-reactjs-frontend.onrender.com' }));
// Optionally, Allow all origins (good for dev, not for prod)
// app.use(cors());

// Parse Inbound requests in JSON
app.use(express.json());

// API route example 1
app.get('/hello', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

// API route example 2
app.post('/extract', async (req, res) => {
  const userInput = req.body.description;
  const prompt = `Given a description of an app, first extract a list called "Roles" containing all agents that perform an action on this app, and for each "Role", devise a sublist called "Features" containing all functionalities of the app performed by the "Role". Each "Feature" will be implemented as a dedicated form on the app, so for each "Feature", devise 2 sublists called "Input Fields" and "Buttons" containing all relevant input fields and buttons that could go on the feature's form, respectively. Then, for each "Feature", include a property called "Entity" by deducing the most appropriate entity that is being acted upon on the feature's form, where this "Entity" will subsequently change state, and the app will typically keep track of this "Entity" through database tables. Finally, return a single JSON Object containing a property named "App Name", giving it an appropriate value considering the overall theme of the app, and a property named "Roles" which is the completed "Roles" list in its nested form. Use this exact JSON schema { "App Name": string, "Roles": [ { "Role": string, "Features": [ { "Feature": string, "Entity": string, "Input Fields": [string], "Buttons": [string] } ] } ] } All key names must match exactly in spelling and capitalization and spacing. Do not include any explanation outside the JSON object, and your response must be a single valid JSON object following my given schema structure precisely.

App Description: """${userInput}"""`;
  // res.json(prompt);  // TESTING PURPOSE
  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: 'nvidia/nemotron-nano-9b-v2:free',
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }
  });

  // Return only the AI's Response
  // AI Response JSON Structure for the Nvidia Chat Completions API Responses
  // TODO: Try Catch the AI Response Parsing
  // TODO: JSON Schema Validate the response and on error, signal to Frontend where it will display "try again" message.
  res.json(response.data.choices[0].message.content);
});

// Simpler Port Listen
app.listen(PORT, () => console.log(`App listening on port ${PORT}!`))

// Alternative Port Listen - Update keepAlive settings for server to avoid TCP race condition.
// const server = app.listen(PORT, () => console.log(`App listening on port ${PORT}!`));
// server.keepAliveTimeout = 120 * 1000;
// server.headersTimeout = 120 * 1000;